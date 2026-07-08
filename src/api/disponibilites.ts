import { supabase } from './supabaseClient';
import type { Disponibilite } from '@/types/database.types';

export async function fetchDisponibilitesEquipeSemaine(
  dateDebut: string,
  dateFin: string,
): Promise<Disponibilite[]> {
  const { data, error } = await supabase
    .from('disponibilites')
    .select('*')
    .gte('date', dateDebut)
    .lte('date', dateFin);
  if (error) throw error;
  return data;
}
