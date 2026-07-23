import { Pressable, Text, View } from 'react-native';

import { statutBoiteCommande, type CaseGrille, type StatutBoiteCommande } from '@/api/stock';

const COLONNES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const LIGNES = [1, 2, 3];

const COULEURS_STATUT: Record<StatutBoiteCommande, string> = {
  vide: '#E2E8F0',
  ok: '#34D399',
  a_commander: '#EF4444',
};

export function GrilleCases({
  grille,
  onPressCase,
}: {
  grille: CaseGrille[];
  onPressCase: (casePosition: string) => void;
}) {
  const parPosition = new Map(grille.map((c) => [c.casePosition, c]));

  return (
    <View className="gap-2">
      {LIGNES.map((ligne) => (
        <View key={ligne} className="flex-row gap-2">
          {COLONNES.map((colonne) => {
            const position = `${colonne}${ligne}`;
            const c = parPosition.get(position);
            const contenus = c?.contenus ?? [];
            const statut = statutBoiteCommande(contenus);

            return (
              <Pressable
                key={position}
                onPress={() => onPressCase(position)}
                style={{ flex: 1 / COLONNES.length }}
                className={`aspect-square justify-between overflow-hidden rounded-xl border p-1.5 shadow-sm hover:border-indigo-300 ${
                  statut === 'a_commander'
                    ? 'border-red-200 bg-red-50'
                    : contenus.length > 0
                      ? 'border-slate-100 bg-white'
                      : 'border-dashed border-slate-200 bg-slate-50'
                }`}
              >
                <Text className="text-[10px] font-semibold text-slate-400">{position}</Text>
                {contenus.length > 0 ? (
                  <>
                    <Text numberOfLines={2} className="text-[11px] font-semibold text-slate-800">
                      {contenus.length === 1 ? contenus[0].pin.nom : `${contenus.length} pins`}
                    </Text>
                    <View className="flex-row items-center justify-between">
                      <Text className="text-[9px] text-slate-400">{contenus.length} pin(s)</Text>
                      <View
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: COULEURS_STATUT[statut] }}
                      />
                    </View>
                  </>
                ) : (
                  <Text className="self-center text-lg text-slate-300">+</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
