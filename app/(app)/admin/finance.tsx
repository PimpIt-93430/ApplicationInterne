// Fallback mobile obligatoire pour Expo Router : une route qui n'existe qu'en .web.tsx doit avoir
// un fichier sans extension de plateforme, sinon la génération des routes échoue ("does not have a
// fallback sibling file without a platform extension"). L'écran Finance n'a pas d'équivalent
// mobile pour l'instant (cf. finance.web.tsx) — ce fichier affiche juste un message, le lien de
// navigation "Finance" n'apparaît de toute façon que sur web (cf. MenuLateral.tsx).
import { Text, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';

export default function FinanceScreenMobile() {
  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Finance" />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-slate-400">
          L'écran Finance n'est disponible que sur la version web pour l'instant.
        </Text>
      </View>
    </View>
  );
}
