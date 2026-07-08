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

export async function supprimerShiftsBrouillon(dateDebut: string, dateFin: string) {
  const { error } = await supabase
    .from('planning_shifts')
    .delete()
    .eq('statut', 'brouillon')
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

export async function validerShiftsSemaine(dateDebut: string, dateFin: string) {
  const { error } = await supabase
    .from('planning_shifts')
    .update({ statut: 'valide' })
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .eq('statut', 'brouillon');
  if (error) throw error;
}

export async function publierShiftsSemaine(dateDebut: string, dateFin: string) {
  const { error } = await supabase
    .from('planning_shifts')
    .update({ statut: 'publie' })
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .eq('statut', 'valide');
  if (error) throw error;
}
