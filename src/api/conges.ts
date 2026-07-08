import { supabase } from './supabaseClient';
import type { Conge, TypeConge } from '@/types/database.types';

export async function fetchCongesProfile(profileId: string): Promise<Conge[]> {
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .eq('profile_id', profileId)
    .order('date_debut', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchCongesPeriode(dateDebut: string, dateFin: string): Promise<Conge[]> {
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .lte('date_debut', dateFin)
    .gte('date_fin', dateDebut);
  if (error) throw error;
  return data;
}

export async function ajouterConge(params: {
  profileId: string;
  dateDebut: string;
  dateFin: string;
  heureDebut: string | null;
  heureFin: string | null;
  type: TypeConge;
  note: string;
}) {
  const { error } = await supabase.from('conges').insert({
    profile_id: params.profileId,
    date_debut: params.dateDebut,
    date_fin: params.dateFin,
    heure_debut: params.heureDebut,
    heure_fin: params.heureFin,
    type: params.type,
    note: params.note,
  });
  if (error) throw error;
}

export async function supprimerConge(id: string) {
  const { error } = await supabase.from('conges').delete().eq('id', id);
  if (error) throw error;
}
