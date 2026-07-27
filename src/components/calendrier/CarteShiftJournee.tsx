import { Text, View } from 'react-native';

import { differenceMinutes, formatDureeHeures, formatHeure } from '@/utils/dateUtils';

/** Carte de shift façon Combo : barre de couleur à gauche, horaire en gras + étiquette libre en
 * dessous, lieu/personne + durée à droite. `couleur` distingue le lieu (vue "Mes shifts") ou la
 * personne (vue "Équipe(s)", déjà filtrée sur un seul lieu). */
export function CarteShiftJournee({
  heureDebut,
  heureFin,
  etiquette,
  libelleDroite,
  couleur,
}: {
  heureDebut: string;
  heureFin: string;
  etiquette?: string | null;
  libelleDroite: string;
  couleur: string;
}) {
  const duree = formatDureeHeures(differenceMinutes(heureDebut, heureFin) / 60);

  return (
    <View className="mb-2 flex-row overflow-hidden rounded-2xl bg-white shadow-sm">
      <View style={{ width: 4, backgroundColor: couleur }} />
      <View className="flex-1 flex-row items-center justify-between p-3">
        <View>
          <Text className="text-base font-bold text-slate-900">
            {formatHeure(heureDebut)} – {formatHeure(heureFin)}
          </Text>
          {!!etiquette && <Text className="mt-0.5 text-sm text-indigo-600">{etiquette}</Text>}
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold text-slate-700">{libelleDroite}</Text>
          <Text className="mt-0.5 text-xs text-slate-400">{duree}</Text>
        </View>
      </View>
    </View>
  );
}
