// Génère automatiquement le planning des prochaines semaines à partir des horaires récurrents —
// cf. retour utilisateur : "avant ça générait tout automatiquement pourquoi tu fais pas
// automatique... à partir du 31 août". Jusqu'ici, le bouton "Générer depuis les horaires
// récurrents" du Hub (app/(hub)/planning/actions.ts genererEtInsererPlanning) ne couvrait que la
// semaine affichée à l'écran — rien ne se passait pour les semaines suivantes tant qu'un admin ne
// cliquait pas dessus à nouveau. Cette fonction répète exactement la même logique
// (lib/generationPlanning.ts genererPlanning, copié quasi verbatim — cf. ce fichier pour le détail
// des règles : jour d'école, congé, pop-up non attribué, contrat pas commencé...), mais pour
// FENETRE_SEMAINES semaines d'un coup, appelée par un cron.
//
// Fenêtre glissante (pas une seule semaine cible) pour la même raison que sync-ventes-sumup passé
// à toutes les 15 minutes plutôt qu'une fois par nuit (cf. migration 0076, App PIMP IT) : si UNE
// exécution du cron échoue ou est en retard, les semaines déjà couvertes lors du run précédent
// restent générées — l'horizon ne retombe jamais brutalement à zéro comme avec une génération
// "juste la semaine suivante".
//
// PUREMENT ADDITIF — ne supprime jamais rien (cf. incident : le premier jet supprimait et
// recréait tous les brouillons genere_automatiquement=true de la fenêtre à chaque run, comme le
// bouton "Générer" du Hub le fait pour sa semaine — sur 52 semaines d'un coup, ça a écrasé des
// créneaux auto-générés que l'utilisateur avait ensuite corrigés à la main (horaire/personne),
// perdant ces corrections sans historique pour les récupérer. Cf. retour utilisateur : "arrête
// écraser les prochaines fois"). Cette fonction ne fait plus qu'INSÉRER les créneaux pour les
// cases (profil + jour + horaire) qui n'ont encore AUCUN créneau, généré ou non — jamais un
// delete. Contrepartie assumée : si un horaire récurrent change, les créneaux déjà générés pour
// les dates futures ne se mettent plus à jour tout seuls (il faudrait alors les corriger ou les
// supprimer à la main avant de relancer) — préférable à effacer silencieusement du travail.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const enTetesCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reponseJson(corps: unknown, status: number) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...enTetesCors, 'Content-Type': 'application/json' },
  });
}

// Nombre de semaines couvertes à chaque run, en partant de la semaine courante (incluse : si un
// horaire vient d'être ajouté ou modifié en cours de semaine, le prochain passage du cron le
// répercute aussi sur les jours restants de cette semaine-ci, pas seulement les suivantes).
// 52 = "toute l'année" (cf. retour utilisateur, comme pour Oparinord) plutôt qu'un horizon glissant
// court : avec les congés/jours d'école et l'écriture groupées en un seul aller-retour (cf. plus
// bas), le coût par semaine supplémentaire est négligeable.
const FENETRE_SEMAINES = 52;
// Taille de lot pour l'upsert final — un seul insert de ~2500 lignes (52 semaines × toute
// l'équipe) passerait sans doute, mais on découpe par prudence (même motif que
// TAILLE_LOT_UPSERT dans sync-ventes-sumup : écrire au fil de l'eau plutôt qu'en un bloc unique).
const TAILLE_LOT_INSERT = 500;

// ---- Types + logique, copiés de Pimp It Hub/lib/generationPlanning.ts (cf. en-tête de ce
// fichier-là : port quasi verbatim de App PIMP IT/src/domain/generationPlanning.ts). Dupliqué ici
// plutôt qu'importé : une Edge Function Deno ne peut pas importer un fichier TypeScript du dépôt
// Next.js voisin au moment du déploiement (fichiers envoyés indépendamment à chaque déploiement).
interface Profile {
  id: string;
  role: 'admin' | 'employe';
  type_contrat: 'manager' | 'employe' | 'alternant';
  actif: boolean;
}
interface PopUp {
  id: string;
  date_debut: string | null;
}
interface Conge {
  profile_id: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
  type: 'conge' | 'indisponibilite' | 'absence' | 'repos';
  statut: 'en_attente' | 'validee' | 'refusee';
}
interface JourEcoleAlternant {
  profile_id: string;
  date: string;
}
interface HoraireRecurrentProfil {
  profile_id: string;
  pop_up_id: string;
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
  actif: boolean;
  pause_debut?: string | null;
  pause_fin?: string | null;
  semaine_reference: 'toutes' | 'premiere' | 'deuxieme';
}
interface RegleHoraireOuverture {
  pop_up_id: string;
  jour_semaine: number;
  heure_ouverture: string;
  heure_fermeture: string;
  actif: boolean;
}
interface PlanningShiftExistant {
  pop_up_id: string;
  profile_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}
interface ShiftGenere {
  pop_up_id: string;
  profile_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  statut: 'brouillon';
  genere_automatiquement: true;
  created_by: string;
  pause_debut?: string | null;
  pause_fin?: string | null;
}
interface JourDeSemaine {
  date: string;
  jour_semaine: number;
}
interface Intervalle {
  heure_debut: string;
  heure_fin: string;
}

function seChevauchent(aDebut: string, aFin: string, bDebut: string, bFin: string): boolean {
  return aDebut < bFin && bDebut < aFin;
}
function estEnConge(conges: Conge[], profileId: string, date: string, heureDebut: string, heureFin: string): boolean {
  return conges.some((c) => {
    if (c.profile_id !== profileId || date < c.date_debut || date > c.date_fin) return false;
    if (c.type === 'conge' && c.statut !== 'validee') return false;
    if (!c.heure_debut || !c.heure_fin) return true;
    return seChevauchent(c.heure_debut, c.heure_fin, heureDebut, heureFin);
  });
}
function estJourEcole(joursEcole: JourEcoleAlternant[], profileId: string, date: string): boolean {
  return joursEcole.some((j) => j.profile_id === profileId && j.date === date);
}
function lundiDeLaSemaine(dateIso: string): Date {
  const d = new Date(`${dateIso}T00:00:00`);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}
function semaineCorrespondPourFrequence(horaire: HoraireRecurrentProfil, date: string, popUps: PopUp[]): boolean {
  if (horaire.semaine_reference === 'toutes') return true;
  const popUp = popUps.find((p) => p.id === horaire.pop_up_id);
  if (!popUp?.date_debut) return true;
  const diffSemaines = Math.round(
    (lundiDeLaSemaine(date).getTime() - lundiDeLaSemaine(popUp.date_debut).getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  const parite = ((diffSemaines % 2) + 2) % 2;
  const semaineAttendue = horaire.semaine_reference === 'deuxieme' ? 1 : 0;
  return parite === semaineAttendue;
}
function pasEncoreCommence(
  datesDebutContrat: { profile_id: string; date_debut_contrat: string | null }[],
  profileId: string,
  date: string,
): boolean {
  const debut = datesDebutContrat.find((d) => d.profile_id === profileId)?.date_debut_contrat;
  return !!debut && date < debut;
}
function fusionnerIntervalles(intervalles: Intervalle[]): Intervalle[] {
  const tries = [...intervalles].sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
  const fusionnes: Intervalle[] = [];
  for (const intervalle of tries) {
    const dernier = fusionnes[fusionnes.length - 1];
    if (dernier && intervalle.heure_debut <= dernier.heure_fin) {
      if (intervalle.heure_fin > dernier.heure_fin) dernier.heure_fin = intervalle.heure_fin;
    } else {
      fusionnes.push({ ...intervalle });
    }
  }
  return fusionnes;
}
function trouverTrousCouverture(ouverture: string, fermeture: string, intervalles: Intervalle[]): Intervalle[] {
  const trous: Intervalle[] = [];
  let curseur = ouverture;
  for (const { heure_debut, heure_fin } of fusionnerIntervalles(intervalles)) {
    if (heure_debut > curseur) trous.push({ heure_debut: curseur, heure_fin: heure_debut });
    if (heure_fin > curseur) curseur = heure_fin;
  }
  if (curseur < fermeture) trous.push({ heure_debut: curseur, heure_fin: fermeture });
  return trous;
}

// ---- Semaines "validées" (cf. retour utilisateur : "une semaine est validée si toutes les
// personnes travaillent 35h ou moins ou si un manager/admin travaille plus et que le pop up est
// couvert à tous les moments, il n'y a pas de trou — c'est bon pour toi ?") — une semaine validée,
// pour un pop-up donné, n'est plus jamais candidate à la génération, même pour boucher un trou
// résiduel : elle est figée telle quelle.
const MINUTES_MAX_NON_MANAGER = 35 * 60;

function minutesDepuis(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + (m || 0);
}
function dureeMinutes(s: { heure_debut: string; heure_fin: string; pause_debut?: string | null; pause_fin?: string | null }): number {
  let d = minutesDepuis(s.heure_fin) - minutesDepuis(s.heure_debut);
  if (s.pause_debut && s.pause_fin) d -= minutesDepuis(s.pause_fin) - minutesDepuis(s.pause_debut);
  return d;
}
function estManagerOuAdmin(profil: Profile | undefined): boolean {
  return !!profil && (profil.role === 'admin' || profil.type_contrat === 'manager');
}

function calculerSemainesValidees(params: {
  semaines: string[]; // lundis ISO de chaque semaine de la fenêtre
  profiles: Profile[];
  horairesOuverture: RegleHoraireOuverture[];
  shiftsExistants: PlanningShiftExistant[];
}): Set<string> {
  const { semaines, profiles, horairesOuverture, shiftsExistants } = params;
  const popUpIds = [...new Set(horairesOuverture.filter((h) => h.actif).map((h) => h.pop_up_id))];
  const profilParId = new Map(profiles.map((p) => [p.id, p]));
  const validees = new Set<string>();

  for (const popUpId of popUpIds) {
    for (const lundiIso of semaines) {
      const datesSemaine = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(`${lundiIso}T00:00:00`);
        d.setDate(d.getDate() + i);
        return isoDate(d);
      });

      // 1) Aucun trou de couverture sur toute la semaine pour ce pop-up.
      let couvertureOk = true;
      for (const date of datesSemaine) {
        const jourSemaine = (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
        const reglesJour = horairesOuverture.filter((h) => h.pop_up_id === popUpId && h.jour_semaine === jourSemaine && h.actif);
        if (reglesJour.length === 0) continue;
        const presencesJour = shiftsExistants.filter((s) => s.pop_up_id === popUpId && s.date === date);
        for (const regle of reglesJour) {
          if (trouverTrousCouverture(regle.heure_ouverture, regle.heure_fermeture, presencesJour).length > 0) {
            couvertureOk = false;
            break;
          }
        }
        if (!couvertureOk) break;
      }
      if (!couvertureOk) continue;

      // 2) Personne (hors manager/admin) au-dessus de 35h sur ce pop-up cette semaine-là.
      const minutesParProfil = new Map<string, number>();
      for (const s of shiftsExistants) {
        if (s.pop_up_id !== popUpId || !datesSemaine.includes(s.date)) continue;
        minutesParProfil.set(s.profile_id, (minutesParProfil.get(s.profile_id) ?? 0) + dureeMinutes(s));
      }
      let heuresOk = true;
      for (const [profileId, minutes] of minutesParProfil) {
        if (minutes > MINUTES_MAX_NON_MANAGER && !estManagerOuAdmin(profilParId.get(profileId))) {
          heuresOk = false;
          break;
        }
      }
      if (!heuresOk) continue;

      validees.add(`${popUpId}|${lundiIso}`);
    }
  }
  return validees;
}
// ---- fin semaines validées

function genererPlanning(params: {
  jours: JourDeSemaine[];
  profiles: Profile[];
  horairesRecurrents: HoraireRecurrentProfil[];
  horairesOuverture: RegleHoraireOuverture[];
  conges: Conge[];
  joursEcole: JourEcoleAlternant[];
  shiftsExistants: PlanningShiftExistant[];
  mapAffectations: Map<string, Set<string>>;
  popUps: PopUp[];
  adminId: string;
  datesDebutContrat?: { profile_id: string; date_debut_contrat: string | null }[];
  semainesValidees: Set<string>;
}): { shifts: ShiftGenere[]; trous: number; semainesIgnorees: number } {
  const {
    jours,
    profiles,
    horairesRecurrents,
    horairesOuverture,
    conges,
    joursEcole,
    shiftsExistants,
    mapAffectations,
    popUps,
    adminId,
    datesDebutContrat = [],
    semainesValidees,
  } = params;

  const profilsEligibles = profiles.filter((p) => p.actif);
  const shifts: ShiftGenere[] = [];
  let trous = 0;
  const semainesIgnoreesVues = new Set<string>();

  for (const jour of jours) {
    const lundiIso = isoDate(lundiDeLaSemaine(jour.date));

    for (const profil of profilsEligibles) {
      const horairesJourPersonne = horairesRecurrents.filter(
        (h) =>
          h.profile_id === profil.id &&
          h.jour_semaine === jour.jour_semaine &&
          h.actif &&
          semaineCorrespondPourFrequence(h, jour.date, popUps),
      );
      for (const horaire of horairesJourPersonne) {
        // Semaine validée pour ce pop-up (cf. calculerSemainesValidees) : figée, on ne tente même
        // pas de boucher un trou résiduel dessus.
        if (semainesValidees.has(`${horaire.pop_up_id}|${lundiIso}`)) {
          semainesIgnoreesVues.add(`${horaire.pop_up_id}|${lundiIso}`);
          continue;
        }
        if (profil.role !== 'admin' && !mapAffectations.get(profil.id)?.has(horaire.pop_up_id)) continue;
        if (estEnConge(conges, profil.id, jour.date, horaire.heure_debut, horaire.heure_fin)) continue;
        if (profil.type_contrat === 'alternant' && estJourEcole(joursEcole, profil.id, jour.date)) continue;
        if (pasEncoreCommence(datesDebutContrat, profil.id, jour.date)) continue;

        const dejaPresent = [...shiftsExistants, ...shifts].some(
          (s) =>
            s.profile_id === profil.id &&
            s.date === jour.date &&
            seChevauchent(s.heure_debut, s.heure_fin, horaire.heure_debut, horaire.heure_fin),
        );
        if (dejaPresent) continue;

        shifts.push({
          pop_up_id: horaire.pop_up_id,
          profile_id: profil.id,
          date: jour.date,
          heure_debut: horaire.heure_debut,
          heure_fin: horaire.heure_fin,
          statut: 'brouillon',
          genere_automatiquement: true,
          created_by: adminId,
          pause_debut: horaire.pause_debut ?? null,
          pause_fin: horaire.pause_fin ?? null,
        });
      }
    }

    const horairesJour = horairesOuverture.filter((h) => h.jour_semaine === jour.jour_semaine && h.actif);
    for (const regleJour of horairesJour) {
      if (semainesValidees.has(`${regleJour.pop_up_id}|${lundiIso}`)) continue; // déjà sans trou par définition
      const presencesJour = [...shiftsExistants, ...shifts].filter(
        (s) => s.pop_up_id === regleJour.pop_up_id && s.date === jour.date,
      );
      trous += trouverTrousCouverture(regleJour.heure_ouverture, regleJour.heure_fermeture, presencesJour).length;
    }
  }

  return { shifts, trous, semainesIgnorees: semainesIgnoreesVues.size };
}
// ---- fin de la logique copiée

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function lundiDeCetteSemaine(): Date {
  const d = new Date();
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: enTetesCors });
  }
  if (req.method !== 'POST') {
    return reponseJson({ error: 'Méthode non autorisée' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clientAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Appel système uniquement (cron) — même schéma que sync-ventes-sumup (cf. ce fichier pour le
  // détail : secret dédié posé dans Vault, comparé via get_vault_secret côté SQL puisque cette
  // fonction n'a qu'un accès PostgREST, pas de connexion Postgres directe).
  const cronSecretHeader = req.headers.get('x-cron-secret');
  let estAppelSysteme = false;
  if (cronSecretHeader) {
    const { data: secretAttendu } = await clientAdmin.rpc('get_vault_secret', {
      p_nom: 'cron_generer_planning_secret',
    });
    estAppelSysteme = !!secretAttendu && cronSecretHeader === secretAttendu;
  }
  if (!estAppelSysteme) {
    return reponseJson({ error: 'Non authentifié' }, 401);
  }

  const { data: profileAdmin } = await clientAdmin.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle();
  const adminId = profileAdmin?.id;
  if (!adminId) {
    return reponseJson({ error: 'Aucun profil admin trouvé pour created_by' }, 500);
  }

  const [
    { data: profiles, error: eProfiles },
    { data: horairesRecurrents, error: eHoraires },
    { data: horairesOuverture, error: eOuverture },
    { data: affectations, error: eAffectations },
    { data: popUps, error: ePopUps },
    { data: informationsRh, error: eRh },
  ] = await Promise.all([
    clientAdmin.from('profiles').select('id, role, type_contrat, actif'),
    clientAdmin.from('horaires_recurrents_profil').select('*'),
    clientAdmin.from('regles_horaires_ouverture').select('*'),
    clientAdmin.from('profil_pop_ups').select('profile_id, pop_up_id'),
    clientAdmin.from('pop_ups').select('id, date_debut'),
    clientAdmin.from('informations_rh').select('profile_id, date_debut_contrat'),
  ]);
  const erreurCommune = eProfiles || eHoraires || eOuverture || eAffectations || ePopUps || eRh;
  if (erreurCommune) {
    return reponseJson({ error: erreurCommune.message }, 500);
  }

  const mapAffectations = new Map<string, Set<string>>();
  for (const a of affectations ?? []) {
    const ensemble = mapAffectations.get(a.profile_id) ?? new Set<string>();
    ensemble.add(a.pop_up_id);
    mapAffectations.set(a.profile_id, ensemble);
  }

  // Toute la fenêtre (jusqu'à 52 semaines) traitée en un seul passage plutôt qu'en boucle
  // semaine par semaine : congés/jours d'école/créneaux existants récupérés une fois pour toute
  // la période (3 requêtes, pas 3 × 52), genererPlanning appelé une seule fois sur l'ensemble des
  // jours (elle gère déjà en interne la dédup cumulative jour après jour), puis un insert par
  // lots (pas de delete, cf. en-tête du fichier) — un ordre de grandeur plus rapide qu'un
  // aller-retour DB par semaine sur un an complet.
  const lundiDepart = lundiDeCetteSemaine();
  const finFenetre = new Date(lundiDepart);
  finFenetre.setDate(finFenetre.getDate() + FENETRE_SEMAINES * 7 - 1);
  const dateDebutTotal = isoDate(lundiDepart);
  const dateFinTotal = isoDate(finFenetre);

  const [
    { data: conges, error: eConges },
    { data: joursEcole, error: eEcole },
    { data: shiftsExistants, error: eShifts },
  ] = await Promise.all([
    clientAdmin.from('conges').select('*').lte('date_debut', dateFinTotal).gte('date_fin', dateDebutTotal),
    clientAdmin.from('jours_ecole_alternant').select('profile_id, date').gte('date', dateDebutTotal).lte('date', dateFinTotal),
    clientAdmin.from('planning_shifts').select('*').gte('date', dateDebutTotal).lte('date', dateFinTotal),
  ]);
  const erreurFenetre = eConges || eEcole || eShifts;
  if (erreurFenetre) {
    return reponseJson({ error: erreurFenetre.message }, 500);
  }

  const jours: JourDeSemaine[] = Array.from({ length: FENETRE_SEMAINES * 7 }, (_, i) => {
    const d = new Date(lundiDepart);
    d.setDate(d.getDate() + i);
    return { date: isoDate(d), jour_semaine: (d.getDay() + 6) % 7 };
  });
  const semainesIso = Array.from({ length: FENETRE_SEMAINES }, (_, s) => {
    const d = new Date(lundiDepart);
    d.setDate(d.getDate() + s * 7);
    return isoDate(d);
  });

  // cf. retour utilisateur : semaines "validées" (aucun trou de couverture + personne hors
  // manager/admin au-dessus de 35h, par pop-up) — jamais retouchées, cf. calculerSemainesValidees.
  const semainesValidees = calculerSemainesValidees({
    semaines: semainesIso,
    profiles: profiles ?? [],
    horairesOuverture: horairesOuverture ?? [],
    shiftsExistants: shiftsExistants ?? [],
  });

  const resultat = genererPlanning({
    jours,
    profiles: profiles ?? [],
    horairesRecurrents: horairesRecurrents ?? [],
    horairesOuverture: horairesOuverture ?? [],
    conges: conges ?? [],
    joursEcole: joursEcole ?? [],
    shiftsExistants: shiftsExistants ?? [],
    mapAffectations,
    popUps: popUps ?? [],
    adminId,
    datesDebutContrat: informationsRh ?? [],
    semainesValidees,
  });

  // Aucun delete — cf. en-tête du fichier. shiftsExistants (chargé plus haut, avant tout calcul)
  // fait déjà que genererPlanning n'a proposé un nouveau créneau que pour les cases encore vides ;
  // tout ce qui existait déjà (généré, corrigé à la main, ou publié) reste intact.
  for (let i = 0; i < resultat.shifts.length; i += TAILLE_LOT_INSERT) {
    const lot = resultat.shifts.slice(i, i + TAILLE_LOT_INSERT);
    const { error: eInsert } = await clientAdmin.from('planning_shifts').insert(lot);
    if (eInsert) {
      return reponseJson(
        { error: eInsert.message, deja_inserees: i, total_a_inserer: resultat.shifts.length },
        500,
      );
    }
  }

  return reponseJson(
    {
      periode: { debut: dateDebutTotal, fin: dateFinTotal },
      total_crees: resultat.shifts.length,
      trous_couverture: resultat.trous,
      semaines_validees_ignorees: resultat.semainesIgnorees,
    },
    200,
  );
});
