import { supabase } from './supabaseClient';
import type { CoqueInventaire, CoqueMappingSumup, CoqueStock } from '@/types/database.types';

export async function fetchCoquesStock(): Promise<CoqueStock[]> {
  const { data, error } = await supabase
    .from('coques_stock')
    .select('*')
    .order('modele', { ascending: true })
    .order('variante', { ascending: true })
    .order('couleur', { ascending: true });
  if (error) throw error;
  return data;
}

export async function definirStockInitialCoque(id: string, quantite: number) {
  const { error } = await supabase
    .from('coques_stock')
    .update({ stock_initial: quantite, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Tous les inventaires jamais faits pour ce pop-up, du plus récent au plus ancien — cf.
 * fetchChaussuresInventaires (même principe). */
export async function fetchCoquesInventaires(popUpId: string): Promise<CoqueInventaire[]> {
  const { data, error } = await supabase
    .from('coques_inventaires')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Enregistre un inventaire complet pour un pop-up (une ligne par modèle/variante/couleur comptée)
 * — jamais un update, toujours de nouvelles lignes, pour garder l'historique de chaque comptage. */
export async function enregistrerInventaireCoques(
  lignes: {
    modele: CoqueInventaire['modele'];
    variante: CoqueInventaire['variante'];
    couleur: CoqueInventaire['couleur'];
    quantite_comptee: number;
  }[],
  profileId: string,
  popUpId: string,
) {
  if (lignes.length === 0) return;
  const { error } = await supabase
    .from('coques_inventaires')
    .insert(lignes.map((l) => ({ ...l, profile_id: profileId, pop_up_id: popUpId })));
  if (error) throw error;
}

export async function fetchMappingSumupCoques(): Promise<CoqueMappingSumup[]> {
  const { data, error } = await supabase.from('coques_mapping_sumup').select('*').order('nom_produit');
  if (error) throw error;
  return data;
}

/** Noms de produits SumUp vus dans au moins une vente mais pas encore associés — même principe que
 * fetchNomsProduitsSumupNonMappes (chaussures.ts), calculé côté client (petit volume). */
export async function fetchNomsProduitsSumupNonMappesCoques(): Promise<string[]> {
  const [{ data: lignes, error: erreurLignes }, { data: mapping, error: erreurMapping }] = await Promise.all([
    supabase.from('ventes_sumup_lignes').select('nom_produit'),
    supabase.from('coques_mapping_sumup').select('nom_produit'),
  ]);
  if (erreurLignes) throw erreurLignes;
  if (erreurMapping) throw erreurMapping;
  const nomsMappes = new Set((mapping ?? []).map((m) => m.nom_produit));
  const nomsVus = new Set((lignes ?? []).map((l) => l.nom_produit));
  return [...nomsVus].filter((n) => !nomsMappes.has(n)).sort();
}

export async function definirMappingSumupCoque(
  nomProduit: string,
  modele: CoqueMappingSumup['modele'],
  variante: CoqueMappingSumup['variante'],
  couleur: CoqueMappingSumup['couleur'],
) {
  const { error } = await supabase
    .from('coques_mapping_sumup')
    .upsert(
      { nom_produit: nomProduit, modele, variante, couleur, updated_at: new Date().toISOString() },
      { onConflict: 'nom_produit' },
    );
  if (error) throw error;
}

export async function supprimerMappingSumupCoque(id: string) {
  const { error } = await supabase.from('coques_mapping_sumup').delete().eq('id', id);
  if (error) throw error;
}
