import { decode } from 'base64-arraybuffer';

import { supabase } from './supabaseClient';
import type { Pointage, TypePointage } from '@/types/database.types';

const BUCKET_PHOTOS = 'pointages-photos';

export interface ResultatPointage {
  type: TypePointage;
  horodatage: string;
  pop_up_nom: string;
  /** Envoi en double (moins de 2 min) : rien de nouveau enregistré, on renvoie le pointage existant. */
  deja_fait: boolean;
}

/** Envoie la photo de la caisse dans le dossier de la personne (bucket privé, cf. migration 0133)
 * puis enregistre le pointage — le serveur vérifie le code du QR et déduit arrivée/départ. Seuls un
 * QR inconnu ou un pop-up sans pointage activé sont refusés, avec un message prêt à afficher. */
export async function pointer(params: { code: string; profileId: string; photoBase64: string }): Promise<ResultatPointage> {
  const chemin = `${params.profileId}/${Date.now()}.jpg`;
  const { error: erreurUpload } = await supabase.storage
    .from(BUCKET_PHOTOS)
    .upload(chemin, decode(params.photoBase64), { contentType: 'image/jpeg' });
  if (erreurUpload) throw new Error(erreurUpload.message);

  const { data, error } = await supabase.rpc('pointer', { p_code: params.code, p_photo_path: chemin });
  if (error) throw new Error(error.message);
  return data as ResultatPointage;
}

/** URL temporaire (5 min) pour afficher la photo de la caisse dans l'écran Pointages. */
export async function obtenirUrlPhotoPointage(chemin: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_PHOTOS).createSignedUrl(chemin, 300);
  if (error) throw error;
  return data.signedUrl;
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
