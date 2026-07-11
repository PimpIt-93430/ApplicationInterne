import type {
  Conge,
  HoraireRecurrentProfil,
  JourEcoleAlternant,
  PlanningShift,
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
    if (!c.heure_debut || !c.heure_fin) return true; // journée complète
    return seChevauchent(c.heure_debut, c.heure_fin, heureDebut, heureFin);
  });
}

function estJourEcole(joursEcole: JourEcoleAlternant[], profileId: string, date: string): boolean {
  return joursEcole.some((j) => j.profile_id === profileId && j.date === date);
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
 * Génère le planning de la semaine à partir de l'horaire récurrent de chaque personne (hors
 * admins, toujours gérés à la main) : pour chaque jour où son horaire habituel est actif, un
 * créneau est créé au lieu qu'il précise, sauf si elle a déclaré une indisponibilité ce jour-là,
 * si c'est un jour d'école pour un alternant, si elle n'est plus attribuée à ce lieu (retirée
 * depuis que l'horaire a été fixé), ou si un créneau lui est déjà attribué (généré plus tôt
 * dans cette même génération, ou déjà présent — ex. un admin placé à la main ailleurs ce
 * jour-là, qu'on ne veut pas doubler). Signale ensuite les horaires d'ouverture non couverts.
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
  adminId: string;
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
    adminId,
  } = params;

  const profilsEligibles = profiles.filter((p) => p.actif && p.role !== 'admin');
  const shifts: ShiftGenere[] = [];
  const alertes: Alerte[] = [];

  for (const jour of jours) {
    for (const profil of profilsEligibles) {
      const horaire = horairesRecurrents.find(
        (h) => h.profile_id === profil.id && h.jour_semaine === jour.jour_semaine && h.actif,
      );
      if (!horaire) continue;
      if (!mapAffectations.get(profil.id)?.has(horaire.pop_up_id)) continue;
      if (estEnConge(conges, profil.id, jour.date, horaire.heure_debut, horaire.heure_fin)) continue;
      if (profil.type_contrat === 'alternant' && estJourEcole(joursEcole, profil.id, jour.date)) continue;

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
      });
    }

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
