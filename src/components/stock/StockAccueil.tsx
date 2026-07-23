import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { ChaussuresScreen } from '@/components/stock/ChaussuresScreen';
import { ConsommablesScreen } from '@/components/stock/ConsommablesScreen';
import { StockScreen } from '@/components/stock/StockScreen';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import type { Profile } from '@/types/database.types';

type Categorie = 'menu' | 'pins' | 'chaussures' | 'consommables';

/** Sur ordinateur, une tuile pleine largeur qui remplit tout l'écran est démesurée (elle n'a de
 * sens que sur un écran de téléphone étroit) : carte compacte à taille fixe à la place, en ligne
 * plutôt qu'empilées. */
function TuileCategorie({
  label,
  sousTitre,
  couleur,
  onPress,
}: {
  label: string;
  sousTitre: string;
  couleur: string;
  onPress: () => void;
}) {
  if (Platform.OS === 'web') {
    return (
      <Pressable
        onPress={onPress}
        style={{ backgroundColor: couleur }}
        className="w-[220px] rounded-2xl p-5 shadow-md hover:opacity-90"
      >
        <Text className="text-lg font-bold text-white">{label}</Text>
        <Text className="mt-1 text-xs text-white/80">{sousTitre}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: couleur }}
      className="flex-1 items-center justify-center rounded-3xl"
    >
      <Text className="text-xl font-bold text-white">{label}</Text>
    </Pressable>
  );
}

/** Point d'entrée de Stock : trois catégories (Pin's / Chaussures / Consommables), chacune avec
 * son propre écran. Identique pour admins et alternants (chaque sous-écran gère lui-même ses
 * propres restrictions, ex. StockScreen avec estAdmin pour la roulette pop-up). */
export function StockAccueil({ profile }: { profile: Profile }) {
  const [categorie, setCategorie] = useState<Categorie>('menu');

  if (categorie === 'pins') {
    return <StockScreen profile={profile} onRetour={() => setCategorie('menu')} />;
  }
  if (categorie === 'chaussures') {
    return <ChaussuresScreen onRetour={() => setCategorie('menu')} />;
  }
  if (categorie === 'consommables') {
    return <ConsommablesScreen onRetour={() => setCategorie('menu')} />;
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Stock" />
      <View className={Platform.OS === 'web' ? 'flex-row flex-wrap gap-4 p-6' : 'flex-1 gap-4 p-4'}>
        <TuileCategorie
          label="Pin's"
          sousTitre="Catalogue, boîtes, commandes"
          couleur="#6366F1"
          onPress={() => setCategorie('pins')}
        />
        <TuileCategorie
          label="Chaussures"
          sousTitre="Réapprovisionnement"
          couleur="#F59E0B"
          onPress={() => setCategorie('chaussures')}
        />
        <TuileCategorie
          label="Consommables"
          sousTitre="Suivi du stock"
          couleur="#10B981"
          onPress={() => setCategorie('consommables')}
        />
      </View>
    </View>
  );
}
