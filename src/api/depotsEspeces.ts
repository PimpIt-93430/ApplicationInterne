import { supabase } from './supabaseClient';
import type { DepotEspece } from '@/types/database.types';

/** Historique des dépôts déjà déclarés (tous pop-up confondus), du plus récent au plus ancien. */
export async function fetchDepotsEspeces(): Promise<DepotEspece[]> {
  const { data, error } = await supabase.from('depots_especes').select('*').order('date_depot', { ascending: false });
  if (error) throw error;
  return data;
}

export async function ajouterDepotEspece(depot: {
  periodeDebut: string;
  periodeFin: string;
  dateDepot: string;
  montant: number;
  profileId: string;
}) {
  const { error } = await supabase.from('depots_especes').insert({
    periode_debut: depot.periodeDebut,
    periode_fin: depot.periodeFin,
    date_depot: depot.dateDepot,
    montant: depot.montant,
    profile_id: depot.profileId,
  });
  if (error) throw error;
}

export async function supprimerDepotEspece(id: string) {
  const { error } = await supabase.from('depots_especes').delete().eq('id', id);
  if (error) throw error;
}
