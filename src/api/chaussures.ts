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

/** Remet tout à 0 une fois le réapprovisionnement effectivement ramené — pas d'historique à
 * effacer ici (contrairement aux pin's), juste la quantité demandée. */
export async function validerReapprovisionnementChaussures() {
  const { error } = await supabase
    .from('chaussures_stock')
    .update({ quantite_a_ramener: 0, updated_at: new Date().toISOString() })
    .gt('quantite_a_ramener', 0);
  if (error) throw error;
}
