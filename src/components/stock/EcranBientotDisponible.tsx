import { Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';

/** Placeholder pour une catégorie de produits pas encore construite (Coques, Sac, Goodies...) —
 * juste la navigation pour l'instant, le contenu viendra dans un prochain chantier. */
export function EcranBientotDisponible({ titre, onRetour }: { titre: string; onRetour: () => void }) {
  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre={titre} onRetour={onRetour} />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-base text-slate-400">
          Bientôt disponible — on y travaille prochainement.
        </Text>
      </View>
    </View>
  );
}
