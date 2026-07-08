import { supabase } from './supabaseClient';
import type {
  RegleEffectifCreneau,
  RegleGlobale,
  RegleHoraireOuverture,
} from '@/types/database.types';

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

export async function fetchEffectifsCreneaux(popUpId: string): Promise<RegleEffectifCreneau[]> {
  const { data, error } = await supabase
    .from('regles_effectifs_creneau')
    .select('*')
    .eq('pop_up_id', popUpId)
    .order('jour_semaine', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchToutesEffectifsCreneaux(): Promise<RegleEffectifCreneau[]> {
  const { data, error } = await supabase
    .from('regles_effectifs_creneau')
    .select('*')
    .order('jour_semaine', { ascending: true });
  if (error) throw error;
  return data;
}

export async function upsertEffectifCreneau(regle: Omit<RegleEffectifCreneau, 'id'> & { id?: string }) {
  const { error } = await supabase
    .from('regles_effectifs_creneau')
    .upsert(regle, { onConflict: 'pop_up_id,jour_semaine,heure_debut,heure_fin' });
  if (error) throw error;
}

export async function deleteEffectifCreneau(id: string) {
  const { error } = await supabase.from('regles_effectifs_creneau').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchReglesGlobales(): Promise<RegleGlobale> {
  const { data, error } = await supabase.from('regles_globales').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function updateReglesGlobales(heuresMaxSemaineDefaut: number) {
  const { error } = await supabase
    .from('regles_globales')
    .update({ heures_max_semaine_defaut: heuresMaxSemaineDefaut })
    .eq('id', 1);
  if (error) throw error;
}
