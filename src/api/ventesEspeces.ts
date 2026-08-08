import { supabase } from './supabaseClient';
import type { VenteEspece } from '@/types/database.types';

export async function fetchVentesEspecesPopUp(popUpId: string): Promise<VenteEspece[]> {
  const { data, error } = await supabase
    .from('ventes_especes')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function ajouterVenteEspece(popUpId: string, profileId: string, montant: number) {
  const { error } = await supabase
    .from('ventes_especes')
    .insert({ pop_up_id: popUpId, profile_id: profileId, montant });
  if (error) throw error;
}

/** Annulation seule : le trigger `proteger_ventes_especes` (migration 0048) renseigne
 * automatiquement `annule_par`/`annule_le` et verrouille la ligne (aucune suppression possible). */
export async function annulerVenteEspece(id: string) {
  const { error } = await supabase.from('ventes_especes').update({ statut: 'annulee' }).eq('id', id);
  if (error) throw error;
}
