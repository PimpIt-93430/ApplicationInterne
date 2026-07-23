import { fetchJoursEcoleProfile } from './alternance';
import { fetchCongesProfile } from './conges';
import { fetchHorairesRecurrents } from './horairesRecurrents';
import { fetchInformationsRh } from './informationsRh';
import {
  fetchShiftsSemaine,
  insererShifts,
  supprimerShiftsGeneresAutomatiquementPourProfil,
} from './planning';
import { fetchPopUps } from './popUps';
import { fetchAffectationsPopUp, fetchProfile } from './profiles';
import { supabase } from './supabaseClient';
import { genererPlanning } from '@/domain/generationPlanning';
import { construireMapAffectations } from '@/utils/affectations';
import { dateEnISO, jourSemaineISO } from '@/utils/dateUtils';

function joursDeLaPeriode(dateDebut: string, dateFin: string): { date: string; jour_semaine: number }[] {
  const jours: { date: string; jour_semaine: number }[] = [];
  let curseur = new Date(`${dateDebut}T00:00:00`);
  const fin = new Date(`${dateFin}T00:00:00`);
  while (curseur <= fin) {
    jours.push({ date: dateEnISO(curseur), jour_semaine: jourSemaineISO(curseur) });
    curseur = new Date(curseur.getTime() + 86_400_000);
  }
  return jours;
}

/** Régénère le planning d'une seule personne sur une période donnée (celle d'une indisponibilité
 * qui vient d'être déclarée ou retirée) : évite de devoir rouvrir le Calendrier admin sur cette
 * semaine pour que le changement se répercute. Ne touche jamais aux créneaux ajoutés à la main
 * (cf. supprimerShiftsGeneresAutomatiquementPourProfil) ni au planning des autres personnes. */
export async function regenererPlanningProfil(profileId: string, dateDebut: string, dateFin: string) {
  const [profil, horaires, conges, joursEcole, affectations, shiftsPeriode, popUps, informationsRh] =
    await Promise.all([
      fetchProfile(profileId),
      fetchHorairesRecurrents(profileId),
      fetchCongesProfile(profileId),
      fetchJoursEcoleProfile(profileId),
      fetchAffectationsPopUp(),
      fetchShiftsSemaine(dateDebut, dateFin),
      fetchPopUps(),
      fetchInformationsRh(profileId),
    ]);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shiftsExistants = shiftsPeriode.filter(
    (s) => s.profile_id === profileId && !(s.statut === 'brouillon' && s.genere_automatiquement),
  );
  const mapAffectations = construireMapAffectations(affectations.filter((a) => a.profile_id === profileId));

  const resultat = genererPlanning({
    jours: joursDeLaPeriode(dateDebut, dateFin),
    profiles: [profil],
    horairesRecurrents: horaires,
    horairesOuverture: [],
    conges,
    joursEcole,
    shiftsExistants,
    mapAffectations,
    popUps,
    adminId: user?.id ?? profileId,
    datesDebutContrat: informationsRh ? [informationsRh] : [],
  });

  await supprimerShiftsGeneresAutomatiquementPourProfil(profileId, dateDebut, dateFin);
  await insererShifts(resultat.shifts);
}
