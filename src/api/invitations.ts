import { supabase } from './supabaseClient';
import type { Role, TypeContrat } from '@/types/database.types';

/** Crée un nouveau compte employé via l'Edge Function `inviter-employe` (admin uniquement côté
 * serveur) : création immédiate, sans email, la ligne `profiles` est créée automatiquement
 * (trigger handle_new_user déjà en place). */
export async function inviterEmploye(params: {
  email: string;
  nomComplet: string;
  role?: Role;
  typeContrat?: TypeContrat;
}): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke('inviter-employe', {
    body: {
      email: params.email,
      nom_complet: params.nomComplet,
      role: params.role,
      type_contrat: params.typeContrat,
    },
  });
  if (error) throw error;
  return data;
}
