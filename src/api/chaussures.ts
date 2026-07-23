import { supabase } from './supabaseClient';
import type { ChaussureStock } from '@/types/database.types';

export async function fetchChaussuresStock(): Promise<ChaussureStock[]> {
  const { data, error } = await supabase
    .from('chaussures_stock')
    .select('*')
    .order('couleur', { ascending: true })
    .order('taille', { ascending: true });
  if (error) throw error;
  return data;
}

export async function definirQuantiteARamener(id: string, quantite: number) {
  const { error } = await supabase
    .from('chaussures_stock')
    .update({ quantite_a_ramener: quantite, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Vendre une paire = il en faut une de plus au prochain réapprovisionnement : on incrémente donc
 * directement `quantite_a_ramener` (pas de colonne de stock disponible distincte aujourd'hui). */
export async function incrementerQuantiteARamener(id: string) {
  const { data: item, error: errorLecture } = await supabase
    .from('chaussures_stock')
    .select('quantite_a_ramener')
    .eq('id', id)
    .single();
  if (errorLecture) throw errorLecture;

  const { error } = await supabase
    .from('chaussures_stock')
    .update({ quantite_a_ramener: item.quantite_a_ramener + 1, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/** Remet tout à 0 une fois le réapprovisionnement effectivement ramené — pas d'historique à
 * effacer ici (contrairement aux pin's), juste la quantité demandée. */
export async function validerReapprovisionnementChaussures() {
  const { error } = await supabase
    .from('chaussures_stock')
    .update({ quantite_a_ramener: 0, updated_at: new Date().toISOString() })
    .gt('quantite_a_ramener', 0);
  if (error) throw error;
}
