import { addDays } from 'date-fns';
import { Pressable, Text, View } from 'react-native';

import { joursDeLaSemaine, libellePeriodeCourte } from '@/utils/dateUtils';

/** Navigation semaine en 3 pastilles (précédente / en cours en indigo / suivante), façon Combo —
 * remplace le nav "‹ label ›" utilisé ailleurs (CalendrierPersonnelEcran.tsx, non touché). */
export function SelecteurSemaineCombo({
  dateReference,
  onPrecedente,
  onSuivante,
  onRevenirAujourdhui,
}: {
  dateReference: Date;
  onPrecedente: () => void;
  onSuivante: () => void;
  onRevenirAujourdhui: () => void;
}) {
  const jours = joursDeLaSemaine(dateReference);
  const joursPrecedents = joursDeLaSemaine(addDays(dateReference, -7));
  const joursSuivants = joursDeLaSemaine(addDays(dateReference, 7));

  return (
    <View className="flex-row items-center justify-between px-2 pb-3">
      <Pressable onPress={onPrecedente} className="flex-1 items-center py-2">
        <Text className="text-center text-xs font-medium text-slate-400">
          {libellePeriodeCourte(joursPrecedents[0], joursPrecedents[6])}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRevenirAujourdhui}
        className="mx-1 items-center rounded-full bg-indigo-600 px-4 py-2"
      >
        <Text className="text-center text-xs font-bold text-white">
          {libellePeriodeCourte(jours[0], jours[6])}
        </Text>
      </Pressable>
      <Pressable onPress={onSuivante} className="flex-1 items-center py-2">
        <Text className="text-center text-xs font-medium text-slate-400">
          {libellePeriodeCourte(joursSuivants[0], joursSuivants[6])}
        </Text>
      </Pressable>
    </View>
  );
}
