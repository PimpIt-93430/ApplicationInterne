import { differenceMinutes } from '@/utils/dateUtils';
import type {
  Conge,
  Disponibilite,
  JourEcoleAlternant,
  Profile,
  RegleEffectifCreneau,
  RegleGlobale,
  TypeContrat,
} from '@/types/database.types';

export interface CreneauACouvrir {
  pop_up_id: string;
  date: string;
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
  nb_managers_requis: number;
  nb_employes_requis: number;
  nb_alternants_requis: number;
}

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

export interface AlerteSousEffectif {
  type: 'sous_effectif';
  pop_up_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  type_contrat: Exclude<TypeContrat, 'manager'>;
  manquants: number;
}

export interface AlerteManagerAbsent {
  type: 'manager_absent';
  pop_up_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
}

export type Alerte = AlerteSousEffectif | AlerteManagerAbsent;

export interface ResultatGeneration {
  shifts: ShiftGenere[];
  alertes: Alerte[];
}

interface JourDeSemaine {
  date: string;
  jour_semaine: number;
}

type ChampEffectifRequis = 'nb_managers_requis' | 'nb_employes_requis' | 'nb_alternants_requis';

const TYPES_A_REMPLIR: { type: TypeContrat; champRequis: ChampEffectifRequis }[] = [
  { type: 'manager', champRequis: 'nb_managers_requis' },
  { type: 'employe', champRequis: 'nb_employes_requis' },
  { type: 'alternant', champRequis: 'nb_alternants_requis' },
];

/**
 * Construit la liste des créneaux à couvrir (tous pop-ups), triés chronologiquement — sauf que
 * tous les créneaux du local (`popUpIdsLocal`) passent avant tous les créneaux des pop-ups,
 * quelle que soit leur date : le local est ainsi toujours servi en premier sur le budget
 * d'heures et de disponibilités de la semaine, les pop-ups ne récupèrent que ce qui reste.
 */
export function construireCreneauxACouvrir(
  jours: JourDeSemaine[],
  reglesEffectifs: RegleEffectifCreneau[],
  popUpIdsLocal: Set<string> = new Set(),
): CreneauACouvrir[] {
  const creneaux: CreneauACouvrir[] = [];
  for (const jour of jours) {
    const reglesDuJour = reglesEffectifs.filter((r) => r.jour_semaine === jour.jour_semaine);
    for (const regle of reglesDuJour) {
      creneaux.push({
        pop_up_id: regle.pop_up_id,
        date: jour.date,
        jour_semaine: jour.jour_semaine,
        heure_debut: regle.heure_debut,
        heure_fin: regle.heure_fin,
        nb_managers_requis: regle.nb_managers_requis,
        nb_employes_requis: regle.nb_employes_requis,
        nb_alternants_requis: regle.nb_alternants_requis,
      });
    }
  }
  return creneaux.sort((a, b) => {
    const prioriteA = popUpIdsLocal.has(a.pop_up_id) ? 0 : 1;
    const prioriteB = popUpIdsLocal.has(b.pop_up_id) ? 0 : 1;
    return (
      prioriteA - prioriteB ||
      a.date.localeCompare(b.date) ||
      a.heure_debut.localeCompare(b.heure_debut) ||
      a.pop_up_id.localeCompare(b.pop_up_id)
    );
  });
}

function estDisponible(disponibilites: Disponibilite[], profileId: string, creneau: CreneauACouvrir): boolean {
  return disponibilites.some(
    (d) =>
      d.profile_id === profileId &&
      d.date === creneau.date &&
      d.heure_debut <= creneau.heure_debut &&
      d.heure_fin >= creneau.heure_fin,
  );
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

function seChevauchent(aDebut: string, aFin: string, bDebut: string, bFin: string): boolean {
  return aDebut < bFin && bDebut < aFin;
}

/**
 * Algorithme glouton multi pop-up : pour chaque créneau (le local d'abord, puis chronologique),
 * remplit manager -> employé -> alternant en équilibrant les heures déjà assignées cette semaine
 * (tous pop-ups confondus), dans la limite du plafond hebdomadaire, en excluant congés,
 * jours d'école des alternants, et tout chevauchement avec un shift déjà assigné ailleurs
 * ce jour-là (un profil ne peut jamais être sur deux pop-ups en même temps).
 */
export function genererPlanning(params: {
  jours: JourDeSemaine[];
  disponibilites: Disponibilite[];
  conges: Conge[];
  joursEcole: JourEcoleAlternant[];
  reglesEffectifs: RegleEffectifCreneau[];
  reglesGlobales: RegleGlobale;
  profiles: Profile[];
  adminId: string;
  popUpIdsLocal?: Set<string>;
}): ResultatGeneration {
  const {
    jours,
    disponibilites,
    conges,
    joursEcole,
    reglesEffectifs,
    reglesGlobales,
    profiles,
    adminId,
    popUpIdsLocal,
  } = params;

  const creneaux = construireCreneauxACouvrir(jours, reglesEffectifs, popUpIdsLocal);
  const profilsActifs = new Map(profiles.filter((p) => p.actif).map((p) => [p.id, p]));
  const minutesAssignees = new Map<string, number>();
  const creneauxAssignesParProfil = new Map<string, { date: string; heure_debut: string; heure_fin: string }[]>();

  const shifts: ShiftGenere[] = [];
  const alertes: Alerte[] = [];

  for (const creneau of creneaux) {
    const dureeSlot = differenceMinutes(creneau.heure_debut, creneau.heure_fin);

    for (const { type, champRequis } of TYPES_A_REMPLIR) {
      const requis = creneau[champRequis] as number;
      if (requis <= 0) continue;

      const candidats = Array.from(profilsActifs.values())
        .filter((p) => p.type_contrat === type)
        // Les admins et les alternants sont disponibles par défaut tout le temps (pas de
        // dispo à déclarer) : les alternants sont de toute façon exclus de leurs jours
        // d'école (cf. filtre estJourEcole) et de leurs congés déclarés. Les employés
        // classiques doivent en revanche déclarer explicitement leur disponibilité.
        .filter(
          (p) =>
            p.role === 'admin' ||
            p.type_contrat === 'alternant' ||
            estDisponible(disponibilites, p.id, creneau),
        )
        .filter((p) => !estEnConge(conges, p.id, creneau.date, creneau.heure_debut, creneau.heure_fin))
        .filter((p) => type !== 'alternant' || !estJourEcole(joursEcole, p.id, creneau.date))
        .filter((p) => {
          const dejaAssignes = creneauxAssignesParProfil.get(p.id) ?? [];
          return !dejaAssignes.some(
            (a) => a.date === creneau.date && seChevauchent(a.heure_debut, a.heure_fin, creneau.heure_debut, creneau.heure_fin),
          );
        })
        .filter((p) => {
          const plafondMinutes = (p.heures_max_semaine ?? reglesGlobales.heures_max_semaine_defaut) * 60;
          const dejaAssignees = minutesAssignees.get(p.id) ?? 0;
          return dejaAssignees + dureeSlot <= plafondMinutes;
        })
        .sort((a, b) => {
          const diff = (minutesAssignees.get(a.id) ?? 0) - (minutesAssignees.get(b.id) ?? 0);
          if (diff !== 0) return diff;
          return (a.nom_complet || '').localeCompare(b.nom_complet || '');
        });

      const retenus = candidats.slice(0, requis);

      for (const p of retenus) {
        shifts.push({
          pop_up_id: creneau.pop_up_id,
          profile_id: p.id,
          date: creneau.date,
          heure_debut: creneau.heure_debut,
          heure_fin: creneau.heure_fin,
          statut: 'brouillon',
          genere_automatiquement: true,
          created_by: adminId,
        });
        minutesAssignees.set(p.id, (minutesAssignees.get(p.id) ?? 0) + dureeSlot);
        const liste = creneauxAssignesParProfil.get(p.id) ?? [];
        liste.push({ date: creneau.date, heure_debut: creneau.heure_debut, heure_fin: creneau.heure_fin });
        creneauxAssignesParProfil.set(p.id, liste);
      }

      if (retenus.length < requis) {
        if (type === 'manager') {
          alertes.push({
            type: 'manager_absent',
            pop_up_id: creneau.pop_up_id,
            date: creneau.date,
            heure_debut: creneau.heure_debut,
            heure_fin: creneau.heure_fin,
          });
        } else {
          alertes.push({
            type: 'sous_effectif',
            pop_up_id: creneau.pop_up_id,
            date: creneau.date,
            heure_debut: creneau.heure_debut,
            heure_fin: creneau.heure_fin,
            type_contrat: type,
            manquants: requis - retenus.length,
          });
        }
      }
    }
  }

  return { shifts, alertes };
}
