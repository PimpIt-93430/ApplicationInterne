import { Text, View } from 'react-native';

import { formatHeure } from '@/utils/dateUtils';

export function CarteShift({
  nomComplet,
  couleur,
  heureDebut,
  heureFin,
  brouillon,
  popUpNom,
}: {
  nomComplet: string;
  couleur: string;
  heureDebut: string;
  heureFin: string;
  brouillon?: boolean;
  popUpNom?: string;
}) {
  const initiale = (nomComplet || '?').trim().slice(0, 1).toUpperCase();

  return (
    <View
      className={`flex-row items-center gap-2 rounded-xl bg-white p-2 shadow-sm ${
        brouillon ? 'border border-dashed border-slate-300' : 'border border-slate-100'
      }`}
    >
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: couleur, opacity: brouillon ? 0.55 : 1 }}
      >
        <Text className="text-xs font-bold text-white">{initiale}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-xs font-semibold text-slate-800" numberOfLines={1}>
          {nomComplet}
        </Text>
        <Text className="text-[11px] text-slate-400">
          {formatHeure(heureDebut)} - {formatHeure(heureFin)}
        </Text>
        {popUpNom ? (
          <Text className="text-[10px] text-slate-400" numberOfLines={1}>
            {popUpNom}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
