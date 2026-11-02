import { supabase } from './supabaseClient';
import type { JourEcoleAlternant } from '@/types/database.types';

export async function fetchJoursEcoleProfile(profileId: string): Promise<JourEcoleAlternant[]> {
  const { data, error } = await supabase
    .from('jours_ecole_alternant')
    .select('*')
    .eq('profile_id', profileId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchJoursEcolePeriode(
  dateDebut: string,
  dateFin: string,
): Promise<JourEcoleAlternant[]> {
  const { data, error } = await supabase
    .from('jours_ecole_alternant')
    .select('*')
    .gte('date', dateDebut)
    .lte('date', dateFin);
  if (error) throw error;
  return data;
}

export async function ajouterJourEcole(profileId: string, date: string) {
  const { error } = await supabase
    .from('jours_ecole_alternant')
    .insert({ profile_id: profileId, date })
    .select()
    .single();
  if (error && error.code !== '23505') throw error; // 23505 = déjà présent (unique profile_id+date)
}

export async function supprimerJourEcole(id: string) {
  // .select() : sans ça une RLS qui bloque la suppression (manager hors équipe) ne remonte rien.
  const { data, error } = await supabase.from('jours_ecole_alternant').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
}

/** Utilisée pour appliquer une demande validée (cf. useTraiterDemandeCalendrierEcole) : on n'a que
 * la date proposée dans le diff, pas l'id de la ligne existante. */
export async function supprimerJourEcoleParDate(profileId: string, date: string) {
  const { error } = await supabase
    .from('jours_ecole_alternant')
    .delete()
    .eq('profile_id', profileId)
    .eq('date', date);
  if (error) throw error;
}
