import { supabase } from './supabaseClient';
import type { ChaussureInventaire, ChaussureMappingSumup, ChaussureStock, VenteSumupLigne } from '@/types/database.types';

export async function fetchChaussuresStock(): Promise<ChaussureStock[]> {
  const { data, error } = await supabase
    .from('chaussures_stock')
    .select('*')
    .order('couleur', { ascending: true })
    .order('taille', { ascending: true });
  if (error) throw error;
  return data;
}

export async function definirStockInitial(id: string, quantite: number) {
  const { error } = await supabase
    .from('chaussures_stock')
    .update({ stock_initial: quantite, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Tous les inventaires jamais faits pour ce pop-up, du plus récent au plus ancien — pour en tirer
 * le dernier comptage par couleur/taille (cf. calculerARamener) et l'historique affiché à l'écran. */
export async function fetchChaussuresInventaires(popUpId: string): Promise<ChaussureInventaire[]> {
  const { data, error } = await supabase
    .from('chaussures_inventaires')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Enregistre un inventaire complet pour un pop-up (une ligne par couleur/taille comptée) —
 * jamais un update, toujours de nouvelles lignes, pour garder l'historique de chaque comptage. */
export async function enregistrerInventaire(
  lignes: { couleur: ChaussureInventaire['couleur']; taille: ChaussureInventaire['taille']; quantite_comptee: number }[],
  profileId: string,
  popUpId: string,
) {
  if (lignes.length === 0) return;
  const { error } = await supabase
    .from('chaussures_inventaires')
    .insert(lignes.map((l) => ({ ...l, profile_id: profileId, pop_up_id: popUpId })));
  if (error) throw error;
}

/** Lignes produit des ventes SumUp de ce pop-up (toutes, pas de fenêtre de date ici — le filtrage
 * par date du dernier inventaire se fait ensuite dans calculerARamener, propre à chaque
 * couleur/taille). Alimenté par sync-ventes-sumup, jamais écrit depuis le client. */
export async function fetchVentesSumupLignes(popUpId: string): Promise<VenteSumupLigne[]> {
  const { data, error } = await supabase
    .from('ventes_sumup_lignes')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('horodatage', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchMappingSumupChaussures(): Promise<ChaussureMappingSumup[]> {
  const { data, error } = await supabase.from('chaussures_mapping_sumup').select('*').order('nom_produit');
  if (error) throw error;
  return data;
}

/** Noms de produits SumUp vus dans au moins une vente mais pas encore associés à une couleur/
 * taille — calculé côté client (petit volume), pas besoin d'une vue dédiée pour ça. */
export async function fetchNomsProduitsSumupNonMappes(): Promise<string[]> {
  const [{ data: lignes, error: erreurLignes }, { data: mapping, error: erreurMapping }] = await Promise.all([
    supabase.from('ventes_sumup_lignes').select('nom_produit'),
    supabase.from('chaussures_mapping_sumup').select('nom_produit'),
  ]);
  if (erreurLignes) throw erreurLignes;
  if (erreurMapping) throw erreurMapping;
  const nomsMappes = new Set((mapping ?? []).map((m) => m.nom_produit));
  const nomsVus = new Set((lignes ?? []).map((l) => l.nom_produit));
  return [...nomsVus].filter((n) => !nomsMappes.has(n)).sort();
}

export async function definirMappingSumup(
  nomProduit: string,
  couleur: ChaussureMappingSumup['couleur'],
  taille: ChaussureMappingSumup['taille'],
) {
  const { error } = await supabase
    .from('chaussures_mapping_sumup')
    .upsert(
      { nom_produit: nomProduit, couleur, taille, updated_at: new Date().toISOString() },
      { onConflict: 'nom_produit' },
    );
  if (error) throw error;
}

export async function supprimerMappingSumup(id: string) {
  const { error } = await supabase.from('chaussures_mapping_sumup').delete().eq('id', id);
  if (error) throw error;
}
