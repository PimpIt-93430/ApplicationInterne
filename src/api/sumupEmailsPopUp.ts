import { supabase } from './supabaseClient';
import type { SumupEmailPopUp } from '@/types/database.types';

export async function fetchSumupEmailsPopUp(): Promise<SumupEmailPopUp[]> {
  const { data, error } = await supabase.from('sumup_emails_pop_up').select('*').order('email');
  if (error) throw error;
  return data;
}

export async function definirSumupEmailPopUp(email: string, popUpId: string) {
  const { error } = await supabase
    .from('sumup_emails_pop_up')
    .upsert(
      { email: email.trim().toLowerCase(), pop_up_id: popUpId, updated_at: new Date().toISOString() },
      { onConflict: 'email' },
    );
  if (error) throw error;
}

export async function supprimerSumupEmailPopUp(id: string) {
  const { error } = await supabase.from('sumup_emails_pop_up').delete().eq('id', id);
  if (error) throw error;
}
