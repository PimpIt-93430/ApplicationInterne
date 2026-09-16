// Route mobile — cf. calendrier.web.tsx pour l'équivalent web (droit calendrier scopé), qui
// retombe lui aussi sur PlanningMobile par défaut.
import { PlanningMobile } from '@/components/calendrier/PlanningMobile';

export default function CalendrierScreen() {
  // L'écran Planning façon Combo (barre basse) remplace le calendrier historique pour tout le
  // monde, admin inclus (cf. onglet "Équipe(s)" avec sélecteur de pop-up, ouvert à l'admin dans
  // PlanningMobile) — mobile et web (retour utilisateur du 2026-09-16).
  return <PlanningMobile />;
}
