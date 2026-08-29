import { router } from 'expo-router';

import { GuidesEcran } from '@/components/profil/GuidesEcran';

export default function GuidesRoute() {
  return <GuidesEcran onRetour={() => router.back()} />;
}
