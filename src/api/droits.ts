import { supabase } from './supabaseClient';
import type { DroitEmploye, Fonctionnalite } from '@/types/database.types';

export async function fetchDroitsEmploye(profileId: string): Promise<DroitEmploye[]> {
  const { data, error } = await supabase.from('droits_employe').select('*').eq('profile_id', profileId);
  if (error) throw error;
  return data;
}

export async function ajouterDroit(params: {
  profileId: string;
  fonctionnalite: Fonctionnalite;
  popUpId: string | null;
}): Promise<DroitEmploye> {
  const { data, error } = await supabase
    .from('droits_employe')
    .insert({ profile_id: params.profileId, fonctionnalite: params.fonctionnalite, pop_up_id: params.popUpId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function supprimerDroit(id: string) {
  const { error } = await supabase.from('droits_employe').delete().eq('id', id);
  if (error) throw error;
}
