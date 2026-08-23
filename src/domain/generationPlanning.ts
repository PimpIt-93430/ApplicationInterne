import type {
  Conge,
  HoraireRecurrentProfil,
  JourEcoleAlternant,
  PlanningShift,
  PopUp,
  Profile,
  RegleHoraireOuverture,
} from '@/types/database.types';

export interface ShiftGenere {
  pop_up_id: string;
  profile_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  statut: 'brouillon';
  genere_automatiquement: true;
  created_by: string;
  /** Reprise de la pause de l'horaire récurrent (cf. HoraireRecurrentProfil.pause_debut/pause_fin)
   * — absente (pas juste nulle) pour les créneaux admin par défaut, qui n'en ont pas. */
  pause_debut?: string | null;
  pause_fin?: string | null;
}

/** Un pop-up est ouvert à un horaire donné mais personne n'y est présent sur ce créneau. */
export interface AlerteTrouCouverture {
  type: 'trou_couverture';
  pop_up_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
}

export type Alerte = AlerteTrouCouverture;

export interface ResultatGeneration {
  shifts: ShiftGenere[];
  alertes: Alerte[];
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

function estEnConge(
  conges: Conge[],
  profileId: string,
  date: string,
  heureDebut: string,
  heureFin: string,
): boolean {
  return conges.some((c) => {
    if (c.profile_id !== profileId || date < c.date_debut || date > c.date_fin) return false;
    // Une demande de congé "en attente" (pas encore validée par un manager/admin) ne doit pas
    // bloquer la génération auto du planning — seule une indisponibilité (jamais soumise à
    // validation) ou un congé effectivement validé compte comme une vraie absence.
    if (c.type === 'conge' && c.statut !== 'validee') return false;
    if (!c.heure_debut || !c.heure_fin) return true; // journée complète
    return seChevauchent(c.heure_debut, c.heure_fin, heureDebut, heureFin);
  });
}

function estJourEcole(joursEcole: JourEcoleAlternant[], profileId: string, date: string): boolean {
  return joursEcole.some((j) => j.profile_id === profileId && j.date === date);
}

/** Lundi de la semaine (ISO) contenant cette date. */
function lundiDeLaSemaine(dateIso: string): Date {
  const d = new Date(`${dateIso}T00:00:00`);
  const offset = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - offset);
  return d;
}

/** Un horaire récurrent "premiere"/"deuxieme" (un jour sur deux) ne s'applique qu'à la semaine
 * qui correspond, la parité étant calée sur la semaine d'ouverture du pop-up (date_debut) — pas
 * sur une date arbitraire, pour que "1ère semaine" veuille dire la même chose pour tout le monde.
 * Un horaire "toutes" (ou un pop-up sans date_debut connue) s'applique toujours. */
function semaineCorrespondPourFrequence(horaire: HoraireRecurrentProfil, date: string, popUps: PopUp[]): boolean {
  if (horaire.semaine_reference === 'toutes') return true;
  const popUp = popUps.find((p) => p.id === horaire.pop_up_id);
  if (!popUp?.date_debut) return true;
  const diffSemaines = Math.round(
    (lundiDeLaSemaine(date).getTime() - lundiDeLaSemaine(popUp.date_debut).getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  const parite = ((diffSemaines % 2) + 2) % 2; // 0 = même semaine que l'ouverture, 1 = l'autre
  const semaineAttendue = horaire.semaine_reference === 'deuxieme' ? 1 : 0;
  return parite === semaineAttendue;
}

/** Une personne n'a pas encore commencé à cette date (date de début de contrat renseignée et
 * postérieure) : aucun créneau ne doit être généré pour elle avant son arrivée réelle. */
function pasEncoreCommence(
  datesDebutContrat: { profile_id: string; date_debut_contrat: string | null }[],
  profileId: string,
  date: string,
): boolean {
  const debut = datesDebutContrat.find((d) => d.profile_id === profileId)?.date_debut_contrat;
  return !!debut && date < debut;
}

/** Fusionne des intervalles [heure_debut, heure_fin] qui se chevauchent ou se touchent. */
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

/** Renvoie les trous (parties non couvertes) d'une plage [ouverture, fermeture] par des intervalles. */
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

/**
 * Génère le planning de la semaine à partir de l'horaire récurrent de chaque personne — y
 * compris les admins (aucun horaire par défaut : à régler explicitement dans Équipe comme
 * n'importe qui) : pour chaque jour où son horaire habituel est actif, un créneau est créé au
 * lieu qu'il précise, sauf si elle a déclaré une indisponibilité ce jour-là, si c'est un jour
 * d'école pour un alternant, si elle n'est plus attribuée à ce lieu (retirée depuis que l'horaire
 * a été fixé — les admins sont toujours considérés attribués à tous les lieux), ou si un créneau
 * lui est déjà attribué (généré plus tôt dans cette même génération, ou déjà présent). Signale
 * ensuite les horaires d'ouverture non couverts.
 */
export function genererPlanning(params: {
  jours: JourDeSemaine[];
  profiles: Profile[];
  horairesRecurrents: HoraireRecurrentProfil[];
  horairesOuverture: RegleHoraireOuverture[];
  conges: Conge[];
  joursEcole: JourEcoleAlternant[];
  shiftsExistants: PlanningShift[];
  mapAffectations: Map<string, Set<string>>;
  popUps: PopUp[];
  adminId: string;
  /** Dates de début de contrat — optionnel (défaut : personne sans date connue, jamais bloquée). */
  datesDebutContrat?: { profile_id: string; date_debut_contrat: string | null }[];
}): ResultatGeneration {
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
  } = params;

  const profilsEligibles = profiles.filter((p) => p.actif);
  const shifts: ShiftGenere[] = [];
  const alertes: Alerte[] = [];

  for (const jour of jours) {
    for (const profil of profilsEligibles) {
      // Une personne peut avoir jusqu'à deux horaires actifs pour le même jour de semaine (un
      // "premiere" et un "deuxieme", avec des heures différentes — cf. migration 0063) : on ne
      // s'arrête plus au premier trouvé, on les considère tous, filtrés par semaine correspondante.
      const horairesJourPersonne = horairesRecurrents.filter(
        (h) =>
          h.profile_id === profil.id &&
          h.jour_semaine === jour.jour_semaine &&
          h.actif &&
          semaineCorrespondPourFrequence(h, jour.date, popUps),
      );
      for (const horaire of horairesJourPersonne) {
        // Un admin est toujours considéré attribué à tous les lieux (cf. estAttribueA côté écrans).
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

    // Les trous de couverture (horaires d'ouverture non couverts par un horaire récurrent) ne sont
    // plus comblés automatiquement par une personne — seulement signalés en alerte. L'auto-
    // remplissage assignait quelqu'un à chaque trou même quand ce n'était pas voulu (créneaux
    // fantômes non désirés, cf. retour utilisateur) ; combler un trou reste une décision manuelle
    // via le panneau de création de shift.
    const horairesJour = horairesOuverture.filter((h) => h.jour_semaine === jour.jour_semaine && h.actif);
    for (const regleJour of horairesJour) {
      const presencesJour = [...shiftsExistants, ...shifts].filter(
        (s) => s.pop_up_id === regleJour.pop_up_id && s.date === jour.date,
      );
      const trous = trouverTrousCouverture(regleJour.heure_ouverture, regleJour.heure_fermeture, presencesJour);
      for (const trou of trous) {
        alertes.push({
          type: 'trou_couverture',
          pop_up_id: regleJour.pop_up_id,
          date: jour.date,
          heure_debut: trou.heure_debut,
          heure_fin: trou.heure_fin,
        });
      }
    }
  }

  return { shifts, alertes };
}
