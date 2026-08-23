import { router } from 'expo-router';

import { SumupPopUpEcran } from '@/components/profil/SumupPopUpEcran';

export default function SumupRoute() {
  return <SumupPopUpEcran onRetour={() => router.back()} />;
}
