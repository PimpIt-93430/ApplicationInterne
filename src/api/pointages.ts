import { supabase } from './supabaseClient';
import type { Pointage, TypePointage } from '@/types/database.types';

export interface ResultatPointage {
  type: TypePointage;
  horodatage: string;
  pop_up_nom: string;
  /** Scan en double (moins de 2 min) : rien de nouveau enregistré, on renvoie le pointage existant. */
  deja_fait: boolean;
}

/** Vérification QR + GPS + heure entièrement côté serveur (cf. migrations 0130-0131, fonction
 * pointer) — jamais refusé pour le GPS, juste marqué gps_ok pour l'écran Pointages. Seul un QR
 * inconnu est refusé, avec un message déjà rédigé pour être affiché tel quel. */
export async function pointer(
  code: string,
  lat: number | null,
  lon: number | null,
  positionSimulee: boolean,
): Promise<ResultatPointage> {
  const { data, error } = await supabase.rpc('pointer', {
    p_code: code,
    p_lat: lat,
    p_lon: lon,
    p_position_simulee: positionSimulee,
  });
  if (error) throw new Error(error.message);
  return data as ResultatPointage;
}

export async function definirPositionPopUp(popUpId: string, lat: number, lon: number) {
  const { error } = await supabase.rpc('definir_position_popup', { p_pop_up_id: popUpId, p_lat: lat, p_lon: lon });
  if (error) throw new Error(error.message);
}

/** Pointages d'un pop-up sur une journée (bornes en heure locale du téléphone = heure de Paris). */
export async function fetchPointagesJour(popUpId: string, debut: Date, fin: Date): Promise<Pointage[]> {
  const { data, error } = await supabase
    .from('pointages')
    .select('*')
    .eq('pop_up_id', popUpId)
    .gte('horodatage', debut.toISOString())
    .lt('horodatage', fin.toISOString())
    .order('horodatage', { ascending: true });
  if (error) throw error;
  return data;
}

/** La personne connectée a-t-elle pointé son arrivée aujourd'hui (n'importe quel pop-up) ? Sert à
 * débloquer les chiffres du jour dans l'onglet Ventes. */
export async function fetchAPointeAujourdhui(profileId: string, debutJour: Date): Promise<boolean> {
  const { count, error } = await supabase
    .from('pointages')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('type', 'arrivee')
    .gte('horodatage', debutJour.toISOString());
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Correction manuelle (oubli de pointer) par un admin ou le manager du pop-up. */
export async function ajouterPointageManuel(params: {
  profileId: string;
  popUpId: string;
  type: TypePointage;
  horodatage: Date;
  saisiPar: string;
}) {
  const { error } = await supabase.from('pointages').insert({
    profile_id: params.profileId,
    pop_up_id: params.popUpId,
    type: params.type,
    horodatage: params.horodatage.toISOString(),
    saisi_par: params.saisiPar,
  });
  if (error) throw error;
}

export async function supprimerPointage(id: string) {
  const { data, error } = await supabase.from('pointages').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
}
