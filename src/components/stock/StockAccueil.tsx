import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChaussuresScreen } from '@/components/stock/ChaussuresScreen';
import { ConsommablesScreen } from '@/components/stock/ConsommablesScreen';
import { StockScreen } from '@/components/stock/StockScreen';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import type { Profile } from '@/types/database.types';

type Categorie = 'menu' | 'pins' | 'chaussures' | 'consommables';

function TuileCategorie({ label, couleur, onPress }: { label: string; couleur: string; onPress: () => void }) {
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
      <View className="flex-1 gap-4 p-4">
        <TuileCategorie label="Pin's" couleur="#6366F1" onPress={() => setCategorie('pins')} />
        <TuileCategorie label="Chaussures" couleur="#F59E0B" onPress={() => setCategorie('chaussures')} />
        <TuileCategorie label="Consommables" couleur="#10B981" onPress={() => setCategorie('consommables')} />
      </View>
    </View>
  );
}
