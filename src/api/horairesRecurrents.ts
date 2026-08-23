import { supabase } from './supabaseClient';
import type { HoraireRecurrentProfil } from '@/types/database.types';

export async function fetchHorairesRecurrents(profileId: string): Promise<HoraireRecurrentProfil[]> {
  const { data, error } = await supabase
    .from('horaires_recurrents_profil')
    .select('*')
    .eq('profile_id', profileId)
    .order('jour_semaine', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchTousHorairesRecurrents(): Promise<HoraireRecurrentProfil[]> {
  const { data, error } = await supabase
    .from('horaires_recurrents_profil')
    .select('*')
    .order('jour_semaine', { ascending: true });
  if (error) throw error;
  return data;
}

export async function upsertHoraireRecurrent(
  horaire: Omit<HoraireRecurrentProfil, 'id' | 'updated_at'> & { id?: string },
) {
  const { error } = await supabase
    .from('horaires_recurrents_profil')
    .upsert(
      { ...horaire, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,jour_semaine,semaine_reference' },
    );
  if (error) throw error;
}

/** Retire un horaire récurrent — utilisé en particulier quand on repasse un jour de "un jour sur
 * deux" à "toutes les semaines" (ou l'inverse) : l'ancienne ligne, devenue hors-sujet, doit
 * disparaître plutôt que de rester active en silence. */
export async function supprimerHoraireRecurrent(id: string) {
  const { error } = await supabase.from('horaires_recurrents_profil').delete().eq('id', id);
  if (error) throw error;
}
