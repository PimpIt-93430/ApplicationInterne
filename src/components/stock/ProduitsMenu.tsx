import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';

export type SousCategorieProduit = 'chaussures' | 'coques' | 'sac' | 'goodies';

/** Tuile avec icône (place de la photo produit à venir plus tard — même gabarit, juste
 * l'illustration à remplacer une fois les photos disponibles). */
function TuileProduit({
  label,
  icone,
  couleur,
  onPress,
}: {
  label: string;
  icone: keyof typeof Ionicons.glyphMap;
  couleur: string;
  onPress: () => void;
}) {
  if (Platform.OS === 'web') {
    return (
      <Pressable
        onPress={onPress}
        style={{ backgroundColor: couleur }}
        className="w-[160px] items-center rounded-2xl p-5 shadow-md"
      >
        <Ionicons name={icone} size={32} color="white" />
        <Text className="mt-2 text-base font-bold text-white">{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: couleur, width: '47%', aspectRatio: 1 }}
      className="items-center justify-center gap-2 rounded-3xl"
    >
      <Ionicons name={icone} size={36} color="white" />
      <Text className="text-base font-bold text-white">{label}</Text>
    </Pressable>
  );
}

/** Menu "Produits" : Chaussures (déjà géré, cf. ChaussuresScreen) + Coques/Sac/Goodies, dont le
 * contenu réel sera construit plus tard — pour l'instant seule cette navigation existe. */
export function ProduitsMenu({
  onOuvrirSousCategorie,
  onRetour,
}: {
  onOuvrirSousCategorie: (categorie: SousCategorieProduit) => void;
  onRetour: () => void;
}) {
  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Produits" onRetour={onRetour} />
      <View
        className={Platform.OS === 'web' ? 'flex-row flex-wrap gap-4 p-6' : 'flex-row flex-wrap gap-4 p-4'}
      >
        <TuileProduit
          label="Chaussures"
          icone="footsteps"
          couleur="#F59E0B"
          onPress={() => onOuvrirSousCategorie('chaussures')}
        />
        <TuileProduit
          label="Coques"
          icone="phone-portrait"
          couleur="#6366F1"
          onPress={() => onOuvrirSousCategorie('coques')}
        />
        <TuileProduit
          label="Sac"
          icone="bag-handle"
          couleur="#EC4899"
          onPress={() => onOuvrirSousCategorie('sac')}
        />
        <TuileProduit
          label="Goodies"
          icone="gift"
          couleur="#10B981"
          onPress={() => onOuvrirSousCategorie('goodies')}
        />
      </View>
    </View>
  );
}
