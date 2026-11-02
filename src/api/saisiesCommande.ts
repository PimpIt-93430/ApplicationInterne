import { supabase } from './supabaseClient';
import type { CategorieSaisieStock, StockSaisieCommande } from '@/types/database.types';

/** Brouillons validés (un par catégorie) de la prochaine commande de ce pop-up — cf. migration 0125. */
export async function fetchSaisiesCommande(popUpId: string): Promise<StockSaisieCommande[]> {
  const { data, error } = await supabase.from('stock_saisies_commande').select('*').eq('pop_up_id', popUpId);
  if (error) throw error;
  return data;
}

/** Enregistre (ou remplace) la saisie d'une catégorie — ce qui la fait passer au vert. Les
 * quantités à 0 sont retirées : seules les variantes réellement demandées sont gardées. */
export async function validerSaisieCommande(params: {
  popUpId: string;
  categorie: CategorieSaisieStock;
  quantites: Record<string, number>;
  descriptionAutre?: string | null;
  profileId: string;
}) {
  const quantites = Object.fromEntries(Object.entries(params.quantites).filter(([, q]) => q > 0));
  const { error } = await supabase.from('stock_saisies_commande').upsert(
    {
      pop_up_id: params.popUpId,
      categorie: params.categorie,
      quantites,
      description_autre: params.descriptionAutre ?? null,
      validee_par: params.profileId,
      validee_at: new Date().toISOString(),
    },
    { onConflict: 'pop_up_id,categorie' },
  );
  if (error) throw error;
}

/** Remet à faire les catégories qui viennent de partir dans une commande (appelé après l'envoi). */
export async function supprimerSaisiesCommande(popUpId: string, categories: CategorieSaisieStock[]) {
  if (categories.length === 0) return;
  // .select() : une suppression bloquée par la RLS ne renvoie aucune erreur sans ça.
  const { error } = await supabase
    .from('stock_saisies_commande')
    .delete()
    .eq('pop_up_id', popUpId)
    .in('categorie', categories)
    .select('id');
  if (error) throw error;
}
