// Route mobile (et fallback web quand la personne n'a aucun droit calendrier, cf.
// calendrier.web.tsx) — le composant réel vit hors de app/ pour éviter un piège de résolution
// Metro (cf. commentaire dans CalendrierPersonnelEcran.tsx).
import { CalendrierPersonnelEcran } from '@/components/calendrier/CalendrierPersonnelEcran';

export default function CalendrierScreen() {
  return <CalendrierPersonnelEcran />;
}
