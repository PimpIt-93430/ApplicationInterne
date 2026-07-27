// Route mobile (et fallback web quand la personne n'a aucun droit calendrier, cf.
// calendrier.web.tsx) — le composant réel vit hors de app/ pour éviter un piège de résolution
// Metro (cf. commentaire dans CalendrierPersonnelEcran.tsx).
import { Platform } from 'react-native';

import { CalendrierPersonnelEcran } from '@/components/calendrier/CalendrierPersonnelEcran';
import { PlanningMobile } from '@/components/calendrier/PlanningMobile';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';

export default function CalendrierScreen() {
  const profileReel = useAuthStore((s) => s.profile);
  const vue = useVueAdminStore((s) => s.vue);
  const estAdminEnVueAdmin = profileReel?.role === 'admin' && vue === 'admin';

  // L'écran Planning façon Combo (barre basse) ne remplace le calendrier historique que pour un
  // non-admin sur mobile — le web (repli sans droit calendrier) et l'admin gardent l'écran existant.
  if (Platform.OS === 'web' || estAdminEnVueAdmin) {
    return <CalendrierPersonnelEcran />;
  }
  return <PlanningMobile />;
}
