import { supabase } from './supabaseClient';
import type { RegleHoraireOuverture } from '@/types/database.types';

export async function fetchHorairesOuverture(popUpId: string): Promise<RegleHoraireOuverture[]> {
  const { data, error } = await supabase
    .from('regles_horaires_ouverture')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('jour_semaine', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchToutesHorairesOuverture(): Promise<RegleHoraireOuverture[]> {
  const { data, error } = await supabase
    .from('regles_horaires_ouverture')
    .select('*')
    .order('jour_semaine', { ascending: true });
  if (error) throw error;
  return data;
}

export async function upsertHoraireOuverture(regle: Omit<RegleHoraireOuverture, 'id'> & { id?: string }) {
  const { error } = await supabase
    .from('regles_horaires_ouverture')
    .upsert(regle, { onConflict: 'pop_up_id,jour_semaine' });
  if (error) throw error;
}
