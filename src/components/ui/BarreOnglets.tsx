import { Pressable, Text, View } from 'react-native';

/** Barre d'onglets en "segmented control" (piste grise, pastille blanche + ombre sur l'onglet
 * actif) — remplace les anciens onglets en blocs pleins indigo, plus proche des standards web/
 * desktop tout en restant identique en confort tactile sur mobile. */
export function BarreOnglets<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: { valeur: T; label: string; badge?: number }[];
  valeur: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row gap-1 rounded-2xl bg-slate-100 p-1">
      {options.map((option) => {
        const actif = option.valeur === valeur;
        return (
          <Pressable
            key={option.valeur}
            onPress={() => onChange(option.valeur)}
            style={
              actif
                ? { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }
                : undefined
            }
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
              actif ? 'bg-white' : ''
            }`}
          >
            <Text className={`text-sm font-semibold ${actif ? 'text-indigo-600' : 'text-slate-500'}`}>
              {option.label}
            </Text>
            {!!option.badge && option.badge > 0 && (
              <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1">
                <Text className="text-[10px] font-bold text-white">{option.badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
