// Route admin (gate déjà géré par admin/_layout.tsx) — voir stock-cible.tsx pour le fallback
// mobile obligatoire (Expo Router), cf. finance.web.tsx pour le même pattern.
import { StockCibleEcran } from '@/components/stock/StockCibleEcran';

export default function StockCibleScreenAdmin() {
  return <StockCibleEcran />;
}
