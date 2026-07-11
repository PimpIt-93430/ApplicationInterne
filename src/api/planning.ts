import { supabase } from './supabaseClient';
import type { PlanningShift } from '@/types/database.types';

export async function fetchShiftsSemaine(dateDebut: string, dateFin: string): Promise<PlanningShift[]> {
  const { data, error } = await supabase
    .from('planning_shifts')
    .select('*')
    .gte('date', dateDebut)
    .lte('date', dateFin);
  if (error) throw error;
  return data;
}

/** Ne supprime que les brouillons créés par la génération automatique — jamais les créneaux
 * ajoutés à la main (ex. un admin placé manuellement quelque part) : une nouvelle génération ne
 * doit jamais effacer un ajout manuel encore en brouillon. */
export async function supprimerShiftsGeneresAutomatiquement(dateDebut: string, dateFin: string) {
  const { error } = await supabase
    .from('planning_shifts')
    .delete()
    .eq('statut', 'brouillon')
    .eq('genere_automatiquement', true)
    .gte('date', dateDebut)
    .lte('date', dateFin);
  if (error) throw error;
}

/** Même chose que `supprimerShiftsGeneresAutomatiquement`, mais limité à une seule personne —
 * utilisé par la régénération ciblée déclenchée à la déclaration/suppression d'une indisponibilité,
 * pour ne pas toucher au planning de tout le monde d'autre sur cette période. */
export async function supprimerShiftsGeneresAutomatiquementPourProfil(
  profileId: string,
  dateDebut: string,
  dateFin: string,
) {
  const { error } = await supabase
    .from('planning_shifts')
    .delete()
    .eq('statut', 'brouillon')
    .eq('genere_automatiquement', true)
    .eq('profile_id', profileId)
    .gte('date', dateDebut)
    .lte('date', dateFin);
  if (error) throw error;
}

export async function insererShifts(
  shifts: Omit<PlanningShift, 'id' | 'created_at' | 'updated_at'>[],
) {
  if (shifts.length === 0) return;
  const { error } = await supabase.from('planning_shifts').insert(shifts);
  if (error) throw error;
}

export async function mettreAJourShift(id: string, changes: Partial<PlanningShift>) {
  const { error } = await supabase.from('planning_shifts').update(changes).eq('id', id);
  if (error) throw error;
}

export async function supprimerShift(id: string) {
  const { error } = await supabase.from('planning_shifts').delete().eq('id', id);
  if (error) throw error;
}
