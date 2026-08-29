// Accessible aux managers et aux admins (contrairement à admin/recap-ventes.tsx, retiré : sous le
// groupe admin/, sa route était bloquée pour un manager par admin/_layout.tsx). RecapVentesEcran
// se scope tout seul via la RLS de ventes_sumup (cf. migration ventes_sumup_lecture_scopee) — un
// manager ne voit que les ventes de son propre pop-up, un admin voit tout. Cf. retour utilisateur
// du 2026-08-24 : "accès à tout comme les admins mais uniquement pour le pop up où ils sont
// associés".
import { RecapVentesEcran } from '@/components/ventes/RecapVentesEcran';

export default function RecapVentesRoute() {
  return <RecapVentesEcran />;
}
