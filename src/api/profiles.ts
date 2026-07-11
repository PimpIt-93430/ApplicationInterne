import { supabase } from './supabaseClient';
import type { ProfilPopUp, Profile } from '@/types/database.types';

export async function fetchProfile(id: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function fetchActiveProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('actif', true)
    .order('nom_complet', { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateOwnProfile(id: string, changes: Partial<Profile>) {
  const { error } = await supabase.from('profiles').update(changes).eq('id', id);
  if (error) throw error;
}

export async function fetchAffectationsPopUp(): Promise<ProfilPopUp[]> {
  const { data, error } = await supabase.from('profil_pop_ups').select('*');
  if (error) throw error;
  return data;
}

export async function ajouterAffectationPopUp(profileId: string, popUpId: string) {
  const { error } = await supabase
    .from('profil_pop_ups')
    .upsert({ profile_id: profileId, pop_up_id: popUpId }, { onConflict: 'profile_id,pop_up_id' });
  if (error) throw error;
}

export async function retirerAffectationPopUp(profileId: string, popUpId: string) {
  const { error } = await supabase
    .from('profil_pop_ups')
    .delete()
    .eq('profile_id', profileId)
    .eq('pop_up_id', popUpId);
  if (error) throw error;
}
