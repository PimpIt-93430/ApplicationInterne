import { supabase } from './supabaseClient';
import type { Profile } from '@/types/database.types';

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

export async function assignerPopUp(profileId: string, popUpId: string | null) {
  const { error } = await supabase.from('profiles').update({ pop_up_id: popUpId }).eq('id', profileId);
  if (error) throw error;
}
