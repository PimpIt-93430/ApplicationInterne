import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { useJoursEcoleProfile } from '@/hooks/useAlternance';
import { useCongesProfile } from '@/hooks/useConges';
import { useInformationsRh } from '@/hooks/useInformationsRh';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import type { StatutConge } from '@/types/database.types';
import { dateEnISO, estDimanche, formatDureeHeures, totalHeuresTravaillees } from '@/utils/dateUtils';

const NB_MOIS_HISTORIQUE = 6;

/** Une journée d'école (CFA) compte comme du temps de travail pour l'alternant, à hauteur d'une
 * journée standard (35h/semaine sur 5 jours). */
const HEURES_PAR_JOUR_ECOLE = 7;

const STATUT_LABEL: Record<StatutConge, string> = {
  en_attente: 'En attente',
  validee: 'Validé',
  refusee: 'Refusé',
};

function formatDate(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'd MMM yyyy', { locale: fr });
}

/** Détail complet (heures / congés / absences) derrière le bouton "Voir l'historique" — les
 * indisponibilités sont regroupées avec les absences (même chose du point de vue RH : la personne
 * n'était pas là). */
export function PanneauHistoriqueRH({ profileId, onFermer }: { profileId: string; onFermer: () => void }) {
  const { data: conges } = useCongesProfile(profileId);

  const mois = useMemo(() => {
    const liste: { debut: Date; fin: Date }[] = [];
    for (let i = 0; i < NB_MOIS_HISTORIQUE; i++) {
      const reference = subMonths(new Date(), i);
      liste.push({ debut: startOfMonth(reference), fin: endOfMonth(reference) });
    }
    return liste;
  }, []);

  const { data: shifts } = useShiftsSemaine(
    dateEnISO(mois[mois.length - 1].debut),
    dateEnISO(mois[0].fin),
  );
  const { data: joursEcole } = useJoursEcoleProfile(profileId);
  const { data: informationsRh } = useInformationsRh(profileId);
  const exclureDimanche = informationsRh?.exclure_heures_dimanche ?? false;

  // Seulement les heures déjà effectuées : un mois passé est entièrement dans le passé de toute
  // façon, mais le mois en cours ne doit pas compter les shifts déjà planifiés plus tard ce mois-ci.
  // Le dimanche compte normalement, sauf réglage contraire sur la fiche (cf. SectionHeuresRH).
  const heuresParMois = useMemo(() => {
    const aujourdhui = dateEnISO(new Date());
    return mois.map(({ debut, fin }) => {
      const finEffective = dateEnISO(fin) > aujourdhui ? aujourdhui : dateEnISO(fin);
      const shiftsDuMois = (shifts ?? []).filter(
        (s) => s.date >= dateEnISO(debut) && s.date <= finEffective && (!exclureDimanche || !estDimanche(s.date)),
      );
      const joursEcoleDuMois = (joursEcole ?? []).filter(
        (j) => j.date >= dateEnISO(debut) && j.date <= finEffective,
      ).length;
      const heures = totalHeuresTravaillees(shiftsDuMois, profileId) + joursEcoleDuMois * HEURES_PAR_JOUR_ECOLE;
      return { debut, heures };
    });
  }, [mois, shifts, joursEcole, profileId, exclureDimanche]);

  const congesTries = [...(conges ?? [])]
    .filter((c) => c.type === 'conge')
    .sort((a, b) => b.date_debut.localeCompare(a.date_debut));

  const absencesTries = [...(conges ?? [])]
    .filter((c) => c.type === 'absence' || c.type === 'indisponibilite')
    .sort((a, b) => b.date_debut.localeCompare(a.date_debut));

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-4 text-lg font-bold text-slate-900">Historique</Text>
      <ScrollView style={{ maxHeight: 560 }}>
        <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">Heures travaillées</Text>
        {heuresParMois.map(({ debut, heures }) => (
          <View
            key={dateEnISO(debut)}
            className="mb-1.5 flex-row items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5"
          >
            <Text className="text-sm font-semibold capitalize text-slate-700">
              {format(debut, 'MMMM yyyy', { locale: fr })}
            </Text>
            <Text className="text-sm text-slate-500">{formatDureeHeures(heures)}</Text>
          </View>
        ))}

        <Text className="mb-2 mt-5 text-xs font-semibold uppercase text-slate-400">Congés</Text>
        {congesTries.length === 0 ? (
          <Text className="mb-2 text-sm text-slate-400">Aucun congé.</Text>
        ) : (
          congesTries.map((c) => (
            <View key={c.id} className="mb-1.5 flex-row items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
              <Text className="text-sm font-semibold text-slate-700">
                {formatDate(c.date_debut)}
                {c.date_fin !== c.date_debut ? ` → ${formatDate(c.date_fin)}` : ''}
              </Text>
              <Text className="text-xs font-semibold text-slate-500">{STATUT_LABEL[c.statut]}</Text>
            </View>
          ))
        )}

        <Text className="mb-2 mt-5 text-xs font-semibold uppercase text-slate-400">Absences</Text>
        {absencesTries.length === 0 ? (
          <Text className="mb-2 text-sm text-slate-400">Aucune absence.</Text>
        ) : (
          absencesTries.map((c) => (
            <View key={c.id} className="mb-1.5 rounded-xl bg-slate-50 px-3.5 py-2.5">
              <Text className="text-sm font-semibold text-slate-700">
                {formatDate(c.date_debut)}
                {c.date_fin !== c.date_debut ? ` → ${formatDate(c.date_fin)}` : ''}
              </Text>
              <Text className="mt-0.5 text-xs text-slate-400">
                {c.note || (c.type === 'indisponibilite' ? 'Indisponibilité' : 'Autre')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
      <Pressable onPress={onFermer} className="mt-4 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}
