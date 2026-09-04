import { router } from 'expo-router';

import { DepotsEspecesEcran } from '@/components/profil/DepotsEspecesEcran';

export default function DepotsEspecesRoute() {
  return <DepotsEspecesEcran onRetour={() => router.back()} />;
}
