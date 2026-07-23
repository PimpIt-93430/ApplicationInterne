import { supabase } from './supabaseClient';
import type { InformationsRh } from '@/types/database.types';

export async function fetchInformationsRh(profileId: string): Promise<InformationsRh | null> {
  const { data, error } = await supabase
    .from('informations_rh')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Juste la date de début de contrat de tout le monde — utilisé par la génération automatique du
 * planning pour ne jamais créer de créneau avant le début réel d'une personne. */
export async function fetchDatesDebutContratTous(): Promise<
  Pick<InformationsRh, 'profile_id' | 'date_debut_contrat'>[]
> {
  const { data, error } = await supabase.from('informations_rh').select('profile_id, date_debut_contrat');
  if (error) throw error;
  return data;
}

export async function upsertInformationsRh(informations: Partial<InformationsRh> & { profile_id: string }) {
  const { error } = await supabase
    .from('informations_rh')
    .upsert({ ...informations, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) throw error;
}
