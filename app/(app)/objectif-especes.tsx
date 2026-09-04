import { router } from 'expo-router';

import { ObjectifEspecesEcran } from '@/components/profil/ObjectifEspecesEcran';

export default function ObjectifEspecesRoute() {
  return <ObjectifEspecesEcran onRetour={() => router.back()} />;
}
