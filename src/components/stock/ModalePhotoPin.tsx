import { Image, Pressable, Text } from 'react-native';

import { FeuilleModale } from '@/components/ui/FeuilleModale';
import type { StockPin } from '@/types/database.types';

export function ModalePhotoPin({ pin, onFermer }: { pin: StockPin; onFermer: () => void }) {
  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-3 text-base font-bold text-slate-900">{pin.nom}</Text>
      {pin.photo_url ? (
        <Image
          source={{ uri: pin.photo_url }}
          resizeMode="contain"
          className="h-56 w-full rounded-2xl bg-slate-100"
        />
      ) : (
        <Text className="text-sm text-slate-400">Pas de photo pour ce pin.</Text>
      )}
      <Pressable onPress={onFermer} className="mt-4 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}
