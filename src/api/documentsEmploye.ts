import { decode } from 'base64-arraybuffer';

import { supabase } from './supabaseClient';
import type { DocumentEmploye } from '@/types/database.types';

export async function fetchDocumentsEmploye(profileId: string): Promise<DocumentEmploye[]> {
  const { data, error } = await supabase
    .from('documents_employe')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Envoie un document vers le bucket privé "documents-employes" (contrairement aux photos de
 * pins, ce bucket n'est pas public : l'accès aux fichiers se fait via URL signée temporaire, cf.
 * `obtenirUrlDocumentEmploye`) et enregistre sa référence en base. */
export async function uploaderDocumentEmploye(params: {
  profileId: string;
  uploadedBy: string;
  nomFichier: string;
  base64: string;
  contentType: string;
}): Promise<DocumentEmploye> {
  const chemin = `${params.profileId}/${Date.now()}-${params.nomFichier}`;
  const { error: erreurUpload } = await supabase.storage
    .from('documents-employes')
    .upload(chemin, decode(params.base64), { contentType: params.contentType });
  if (erreurUpload) throw erreurUpload;

  const { data, error } = await supabase
    .from('documents_employe')
    .insert({
      profile_id: params.profileId,
      nom_fichier: params.nomFichier,
      chemin_stockage: chemin,
      uploaded_by: params.uploadedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** URL signée temporaire (5 min) pour consulter/télécharger un document du bucket privé. */
export async function obtenirUrlDocumentEmploye(cheminStockage: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents-employes')
    .createSignedUrl(cheminStockage, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function supprimerDocumentEmploye(id: string, cheminStockage: string) {
  const { error: erreurStorage } = await supabase.storage.from('documents-employes').remove([cheminStockage]);
  if (erreurStorage) throw erreurStorage;
  const { error } = await supabase.from('documents_employe').delete().eq('id', id);
  if (error) throw error;
}
