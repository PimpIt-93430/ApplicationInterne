import { Text, View } from 'react-native';

import { dureeShiftMinutes, formatCreneauShift, formatDureeHeures } from '@/utils/dateUtils';

/** Carte de shift façon Combo : barre de couleur à gauche, horaire en gras + étiquette libre en
 * dessous, lieu/personne + durée à droite. `couleur` distingue le lieu (vue "Mes shifts") ou la
 * personne (vue "Équipe(s)", déjà filtrée sur un seul lieu). Horaire affiché segmenté de part et
 * d'autre de la pause déjeuner quand elle est renseignée, durée toujours nette (pause déduite). */
export function CarteShiftJournee({
  heureDebut,
  heureFin,
  pauseDebut,
  pauseFin,
  etiquette,
  libelleDroite,
  couleur,
}: {
  heureDebut: string;
  heureFin: string;
  pauseDebut?: string | null;
  pauseFin?: string | null;
  etiquette?: string | null;
  libelleDroite: string;
  couleur: string;
}) {
  const shift = { heure_debut: heureDebut, heure_fin: heureFin, pause_debut: pauseDebut, pause_fin: pauseFin };
  const duree = formatDureeHeures(dureeShiftMinutes(shift) / 60);

  return (
    <View className="mb-2 flex-row overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <View style={{ width: 4, backgroundColor: couleur }} />
      <View className="flex-1 flex-row items-center justify-between p-3">
        <View>
          <Text className="text-base font-bold text-slate-900">{formatCreneauShift(shift)}</Text>
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
