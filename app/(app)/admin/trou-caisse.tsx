import { router } from 'expo-router';

import { TrouCaisseEcran } from '@/components/profil/TrouCaisseEcran';

export default function TrouCaisseRoute() {
  return <TrouCaisseEcran onRetour={() => router.back()} />;
}
