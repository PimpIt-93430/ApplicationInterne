// Route mobile (et fallback web quand la personne n'a aucun droit calendrier, cf.
// calendrier.web.tsx) — le composant réel vit hors de app/ pour éviter un piège de résolution
// Metro (cf. commentaire dans CalendrierPersonnelEcran.tsx).
import { Platform } from 'react-native';

import { CalendrierPersonnelEcran } from '@/components/calendrier/CalendrierPersonnelEcran';
import { PlanningMobile } from '@/components/calendrier/PlanningMobile';

export default function CalendrierScreen() {
  // L'écran Planning façon Combo (barre basse) remplace le calendrier historique pour tout le
  // monde sur mobile, admin inclus (cf. onglet "Équipe(s)" avec sélecteur de pop-up, ouvert à
  // l'admin dans PlanningMobile) — seul le web garde l'écran existant.
  if (Platform.OS === 'web') {
    return <CalendrierPersonnelEcran />;
  }
  return <PlanningMobile />;
}
