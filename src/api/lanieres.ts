import { supabase } from './supabaseClient';
import type { LaniereInventaire, LaniereMappingSumup, LaniereStock, VenteSumupLigne } from '@/types/database.types';

export async function fetchLanieresStock(): Promise<LaniereStock[]> {
  const { data, error } = await supabase
    .from('lanieres_stock')
    .select('*')
    .order('couleur', { ascending: true })
    .order('taille', { ascending: true });
  if (error) throw error;
  return data;
}

export async function definirStockInitialLaniere(id: string, quantite: number) {
  const { error } = await supabase
    .from('lanieres_stock')
    .update({ stock_initial: quantite, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Tous les inventaires jamais faits pour ce pop-up, du plus récent au plus ancien — cf.
 * fetchChaussuresInventaires (même principe). */
export async function fetchLanieresInventaires(popUpId: string): Promise<LaniereInventaire[]> {
  const { data, error } = await supabase
    .from('lanieres_inventaires')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Enregistre un inventaire complet pour un pop-up (une ligne par couleur/taille comptée) —
 * jamais un update, toujours de nouvelles lignes, pour garder l'historique de chaque comptage. */
export async function enregistrerInventaireLanieres(
  lignes: { couleur: LaniereInventaire['couleur']; taille: LaniereInventaire['taille']; quantite_comptee: number }[],
  profileId: string,
  popUpId: string,
) {
  if (lignes.length === 0) return;
  const { error } = await supabase
    .from('lanieres_inventaires')
    .insert(lignes.map((l) => ({ ...l, profile_id: profileId, pop_up_id: popUpId })));
  if (error) throw error;
}

export async function fetchMappingSumupLanieres(): Promise<LaniereMappingSumup[]> {
  const { data, error } = await supabase.from('lanieres_mapping_sumup').select('*').order('nom_produit');
  if (error) throw error;
  return data;
}

/** Noms de produits SumUp vus dans au moins une vente mais pas encore associés — même principe que
 * fetchNomsProduitsSumupNonMappes (chaussures.ts), calculé côté client (petit volume). */
export async function fetchNomsProduitsSumupNonMappesLanieres(): Promise<string[]> {
  const [{ data: lignes, error: erreurLignes }, { data: mapping, error: erreurMapping }] = await Promise.all([
    supabase.from('ventes_sumup_lignes').select('nom_produit'),
    supabase.from('lanieres_mapping_sumup').select('nom_produit'),
  ]);
  if (erreurLignes) throw erreurLignes;
  if (erreurMapping) throw erreurMapping;
  const nomsMappes = new Set((mapping ?? []).map((m) => m.nom_produit));
  const nomsVus = new Set(((lignes ?? []) as VenteSumupLigne[]).map((l) => l.nom_produit));
  return [...nomsVus].filter((n) => !nomsMappes.has(n)).sort();
}

export async function definirMappingSumupLaniere(
  nomProduit: string,
  couleur: LaniereMappingSumup['couleur'],
  taille: LaniereMappingSumup['taille'],
) {
  const { error } = await supabase
    .from('lanieres_mapping_sumup')
    .upsert({ nom_produit: nomProduit, couleur, taille, updated_at: new Date().toISOString() }, { onConflict: 'nom_produit' });
  if (error) throw error;
}

export async function supprimerMappingSumupLaniere(id: string) {
  const { error } = await supabase.from('lanieres_mapping_sumup').delete().eq('id', id);
  if (error) throw error;
}
