import { Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';

export function ConsommablesScreen({ onRetour }: { onRetour: () => void }) {
  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Consommables" onRetour={onRetour} />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-base font-semibold text-slate-400">
          Écran en cours de développement
        </Text>
      </View>
    </View>
  );
}
