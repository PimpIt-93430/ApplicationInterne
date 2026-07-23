// Route admin (gate déjà géré par admin/_layout.tsx) — voir app/(app)/finance.web.tsx pour la
// route accessible à un non-admin ayant un droit "finance", et src/components/finance/FinanceEcran
// pour le composant partagé entre les deux (même pattern que Stock : app/(app)/stock.tsx et
// app/(app)/admin/stock.tsx rendent déjà le même StockScreen).
import { FinanceEcran } from '@/components/finance/FinanceEcran';

export default function FinanceScreenAdmin() {
  return <FinanceEcran />;
}
