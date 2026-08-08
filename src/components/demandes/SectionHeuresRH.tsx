import { differenceInCalendarDays, endOfMonth, endOfYear, format, startOfMonth, startOfYear } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useJoursEcoleProfile } from '@/hooks/useAlternance';
import { useCongesProfile } from '@/hooks/useConges';
import { useInformationsRh } from '@/hooks/useInformationsRh';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import type { Conge } from '@/types/database.types';
import { dateEnISO, estDimanche, formatDureeHeures, totalHeuresTravaillees } from '@/utils/dateUtils';

/** Standard légal français (5 semaines), même chiffre pour tout le monde pour l'instant — pas
 * encore de vrai système d'acquisition par personne en base. */
const JOURS_CONGE_PAR_AN = 25;

/** Une journée d'école (CFA) compte comme du temps de travail pour l'alternant, à hauteur d'une
 * journée standard (35h/semaine sur 5 jours). */
const HEURES_PAR_JOUR_ECOLE = 7;

/** Nombre de jours d'un congé/absence qui tombent dans [periodeDebut, periodeFin] — comptage simple
 * par jour calendaire, sans tenir compte des créneaux partiels (décision TODO du 2026-07-22). */
function joursDansPeriode(conge: Conge, periodeDebut: Date, periodeFin: Date): number {
  const debut = new Date(Math.max(new Date(`${conge.date_debut}T00:00:00`).getTime(), periodeDebut.getTime()));
  const fin = new Date(Math.min(new Date(`${conge.date_fin}T00:00:00`).getTime(), periodeFin.getTime()));
  if (fin < debut) return 0;
  return differenceInCalendarDays(fin, debut) + 1;
}

/** Compteur toujours visible (heures du mois en cours + solde de congés) — le détail complet
 * (historique heures/congés/absences) est derrière "Voir l'historique" pour ne pas prendre toute
 * la place sur l'écran principal. Les indisponibilités comptent comme des absences ici (décision
 * utilisateur : "les indisponibilités sont des absences"). */
export function SectionHeuresRH({
  profileId,
  onVoirHistorique,
}: {
  profileId: string;
  onVoirHistorique: () => void;
}) {
  const moisCourant = useMemo(() => ({ debut: startOfMonth(new Date()), fin: endOfMonth(new Date()) }), []);
  const anneeCourante = useMemo(() => ({ debut: startOfYear(new Date()), fin: endOfYear(new Date()) }), []);

  const { data: shifts, isLoading: chargementShifts } = useShiftsSemaine(
    dateEnISO(moisCourant.debut),
    dateEnISO(moisCourant.fin),
  );
  const { data: conges } = useCongesProfile(profileId);
  const { data: joursEcole } = useJoursEcoleProfile(profileId);
  const { data: informationsRh } = useInformationsRh(profileId);
  const exclureDimanche = informationsRh?.exclure_heures_dimanche ?? false;

  // Seulement les heures déjà effectuées (jusqu'à aujourd'hui inclus) : les shifts déjà planifiés
  // plus tard dans le mois ne sont pas encore du temps réellement travaillé. Le dimanche compte
  // normalement, sauf réglage contraire sur la fiche de la personne (payé sur un contrat séparé,
  // cf. Équipe → Contrat → "Ne pas compter les heures du dimanche").
  const heuresCeMois = useMemo(() => {
    const aujourdhui = dateEnISO(new Date());
    const heuresShifts = totalHeuresTravaillees(
      (shifts ?? []).filter((s) => s.date <= aujourdhui && (!exclureDimanche || !estDimanche(s.date))),
      profileId,
    );
    const joursEcoleCeMois = (joursEcole ?? []).filter(
      (j) => j.date >= dateEnISO(moisCourant.debut) && j.date <= aujourdhui,
    ).length;
    return heuresShifts + joursEcoleCeMois * HEURES_PAR_JOUR_ECOLE;
  }, [shifts, profileId, joursEcole, moisCourant, exclureDimanche]);

  const congesPrisCetteAnnee = useMemo(
    () =>
      (conges ?? [])
        .filter((c) => c.type === 'conge' && c.statut === 'validee')
        .reduce((total, c) => total + joursDansPeriode(c, anneeCourante.debut, anneeCourante.fin), 0),
    [conges, anneeCourante],
  );
  const congesRestants = Math.max(0, JOURS_CONGE_PAR_AN - congesPrisCetteAnnee);

  const chargement = chargementShifts;

  return (
    <View className="mb-5">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Mes heures</Text>

      <View className="mb-3 rounded-2xl bg-white p-4 shadow-sm">
        <Text className="text-xs capitalize text-slate-400">
          {format(new Date(), 'MMMM yyyy', { locale: fr })}
        </Text>
        {chargement ? (
          <ActivityIndicator color="#6366F1" style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        ) : (
          <>
            <Text className="mt-1 text-2xl font-bold text-slate-900">{formatDureeHeures(heuresCeMois)}</Text>
            <Text className="mt-0.5 text-xs text-slate-400">travaillées ce mois-ci</Text>
          </>
        )}
      </View>

      <View className="mb-3 flex-row gap-3">
        <View className="flex-1 rounded-2xl bg-white p-4 shadow-sm">
          <Text className="text-2xl font-bold text-slate-900">{congesRestants}</Text>
          <Text className="mt-0.5 text-xs text-slate-400">jours de congé restants</Text>
        </View>
        <View className="flex-1 rounded-2xl bg-white p-4 shadow-sm">
          <Text className="text-2xl font-bold text-slate-900">{congesPrisCetteAnnee}</Text>
          <Text className="mt-0.5 text-xs text-slate-400">jours pris cette année</Text>
        </View>
      </View>

      <Pressable onPress={onVoirHistorique} className="items-center rounded-xl bg-slate-100 py-3">
        <Text className="text-sm font-semibold text-indigo-600">Voir l'historique</Text>
      </Pressable>
    </View>
  );
}
