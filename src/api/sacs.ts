import { supabase } from './supabaseClient';
import type { SacInventaire, SacMappingSumup, SacStock } from '@/types/database.types';

export async function fetchSacsStock(): Promise<SacStock[]> {
  const { data, error } = await supabase
    .from('sacs_stock')
    .select('*')
    .order('produit', { ascending: true })
    .order('couleur', { ascending: true });
  if (error) throw error;
  return data;
}

export async function definirStockInitialSac(id: string, quantite: number) {
  const { error } = await supabase
    .from('sacs_stock')
    .update({ stock_initial: quantite, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Tous les inventaires jamais faits pour ce pop-up, du plus récent au plus ancien — cf.
 * fetchChaussuresInventaires (même principe). */
export async function fetchSacsInventaires(popUpId: string): Promise<SacInventaire[]> {
  const { data, error } = await supabase
    .from('sacs_inventaires')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Enregistre un inventaire complet pour un pop-up (une ligne par produit/couleur comptée) — jamais
 * un update, toujours de nouvelles lignes, pour garder l'historique de chaque comptage. */
export async function enregistrerInventaireSacs(
  lignes: { produit: SacInventaire['produit']; couleur: SacInventaire['couleur']; quantite_comptee: number }[],
  profileId: string,
  popUpId: string,
) {
  if (lignes.length === 0) return;
  const { error } = await supabase
    .from('sacs_inventaires')
    .insert(lignes.map((l) => ({ ...l, profile_id: profileId, pop_up_id: popUpId })));
  if (error) throw error;
}

export async function fetchMappingSumupSacs(): Promise<SacMappingSumup[]> {
  const { data, error } = await supabase.from('sacs_mapping_sumup').select('*').order('nom_produit');
  if (error) throw error;
  return data;
}

/** Noms de produits SumUp vus dans au moins une vente mais pas encore associés — même principe que
 * fetchNomsProduitsSumupNonMappes (chaussures.ts), calculé côté client (petit volume). */
export async function fetchNomsProduitsSumupNonMappesSacs(): Promise<string[]> {
  const [{ data: lignes, error: erreurLignes }, { data: mapping, error: erreurMapping }] = await Promise.all([
    supabase.from('ventes_sumup_lignes').select('nom_produit'),
    supabase.from('sacs_mapping_sumup').select('nom_produit'),
  ]);
  if (erreurLignes) throw erreurLignes;
  if (erreurMapping) throw erreurMapping;
  const nomsMappes = new Set((mapping ?? []).map((m) => m.nom_produit));
  const nomsVus = new Set((lignes ?? []).map((l) => l.nom_produit));
  return [...nomsVus].filter((n) => !nomsMappes.has(n)).sort();
}

export async function definirMappingSumupSac(
  nomProduit: string,
  produit: SacMappingSumup['produit'],
  couleur: SacMappingSumup['couleur'],
) {
  const { error } = await supabase
    .from('sacs_mapping_sumup')
    .upsert(
      { nom_produit: nomProduit, produit, couleur, updated_at: new Date().toISOString() },
      { onConflict: 'nom_produit' },
    );
  if (error) throw error;
}

export async function supprimerMappingSumupSac(id: string) {
  const { error } = await supabase.from('sacs_mapping_sumup').delete().eq('id', id);
  if (error) throw error;
}
