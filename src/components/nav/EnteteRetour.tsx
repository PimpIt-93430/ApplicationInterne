import { Pressable, Text, View } from 'react-native';

/** Même gabarit que EnteteMenu (même dégagement du haut, même disposition), mais avec une flèche
 * retour au lieu du hamburger — pour les écrans atteints via un sous-menu (ex. les catégories de
 * Stock) plutôt que directement depuis le menu latéral. */
export function EnteteRetour({ titre, onRetour }: { titre: string; onRetour: () => void }) {
  return (
    <View className="flex-row items-center gap-3 px-4 pb-2 pt-14">
      <Pressable onPress={onRetour} className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
        <Text className="text-lg text-slate-700">‹</Text>
      </Pressable>
      <Text className="text-2xl font-bold text-slate-900">{titre}</Text>
    </View>
  );
}
