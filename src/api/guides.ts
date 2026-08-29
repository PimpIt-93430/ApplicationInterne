import { decode } from 'base64-arraybuffer';

import { supabase } from './supabaseClient';
import type { Guide } from '@/types/database.types';

export async function fetchGuides(): Promise<Guide[]> {
  const { data, error } = await supabase.from('guides').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Envoie un guide vers le bucket privé "guides" (accès en lecture ouvert à tout le monde côté
 * RLS storage, contrairement à "documents-employes" — cf. migration) et enregistre sa référence
 * en base. */
export async function uploaderGuide(params: {
  titre: string;
  uploadedBy: string;
  nomFichier: string;
  base64: string;
  contentType: string;
}): Promise<Guide> {
  const chemin = `${Date.now()}-${params.nomFichier}`;
  const { error: erreurUpload } = await supabase.storage
    .from('guides')
    .upload(chemin, decode(params.base64), { contentType: params.contentType });
  if (erreurUpload) throw erreurUpload;

  const { data, error } = await supabase
    .from('guides')
    .insert({
      titre: params.titre,
      nom_fichier: params.nomFichier,
      chemin_stockage: chemin,
      uploaded_by: params.uploadedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** URL signée temporaire (5 min) pour consulter/télécharger un guide du bucket privé. */
export async function obtenirUrlGuide(cheminStockage: string): Promise<string> {
  const { data, error } = await supabase.storage.from('guides').createSignedUrl(cheminStockage, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function supprimerGuide(id: string, cheminStockage: string) {
  const { error: erreurStorage } = await supabase.storage.from('guides').remove([cheminStockage]);
  if (erreurStorage) throw erreurStorage;
  const { error } = await supabase.from('guides').delete().eq('id', id);
  if (error) throw error;
}
