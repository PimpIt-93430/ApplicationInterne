import { supabase } from './supabaseClient';
import type { CommandeConsommableLigne, CommandeConsommables, TypeConsommable } from '@/types/database.types';

/** Liste fixe des types de consommables proposés — "autre" laisse une description libre. */
export const TYPES_CONSOMMABLES: { valeur: TypeConsommable; label: string }[] = [
  { valeur: 'pochon', label: 'Pochon' },
  { valeur: 'sac_chaussures', label: 'Sac pour chaussures' },
  { valeur: 'scotch_double_face', label: 'Scotch double face' },
  { valeur: 'enveloppes', label: 'Enveloppes' },
  { valeur: 'sac_poubelle', label: 'Sac poubelle' },
  { valeur: 'autre', label: 'Autre' },
];

export interface CommandeConsommablesAvecLignes {
  commande: CommandeConsommables;
  lignes: CommandeConsommableLigne[];
}

/** Commande de consommables en cours (pas encore reçue) pour ce pop-up, avec ses lignes. null si
 * aucune commande en vol. */
export async function fetchCommandeActiveConsommables(
  popUpId: string,
): Promise<CommandeConsommablesAvecLignes | null> {
  const { data, error } = await supabase
    .from('commandes_consommables')
    .select('*, lignes:commande_consommables_lignes(*)')
    .eq('pop_up_id', popUpId)
    .neq('statut', 'recue')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { lignes, ...commande } = data as unknown as CommandeConsommables & {
    lignes: CommandeConsommableLigne[];
  };
  return { commande, lignes };
}

/** Crée une demande de consommables (statut "demandee") avec ses lignes — une seule commande en
 * vol à la fois par pop-up (contrainte en base, migration 0043). */
export async function demanderConsommables(params: {
  popUpId: string;
  profileId: string;
  lignes: { type: TypeConsommable; description: string | null }[];
}): Promise<string> {
  const { popUpId, profileId, lignes } = params;
  const { data: commande, error: errorCommande } = await supabase
    .from('commandes_consommables')
    .insert({ pop_up_id: popUpId, demandee_par: profileId })
    .select('id')
    .single();
  if (errorCommande) throw errorCommande;

  const { error: errorLignes } = await supabase.from('commande_consommables_lignes').insert(
    lignes.map((l) => ({ commande_id: commande.id, type: l.type, description: l.description })),
  );
  if (errorLignes) throw errorLignes;

  return commande.id;
}

/** Coche/décoche un type de consommable sur une demande déjà créée, enregistré immédiatement —
 * seulement possible tant qu'elle est encore "demandee" côté base (RLS, migration 0043) :
 * verrouillé dès que le local marque "envoyée". */
export async function basculerLigneConsommable(params: {
  commandeId: string;
  type: TypeConsommable;
  description: string | null;
  inclus: boolean;
}) {
  const { commandeId, type, description, inclus } = params;
  if (inclus) {
    const { error } = await supabase
      .from('commande_consommables_lignes')
      .insert({ commande_id: commandeId, type, description });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('commande_consommables_lignes')
      .delete()
      .eq('commande_id', commandeId)
      .eq('type', type);
    if (error) throw error;
  }
}

/** Met à jour la description libre de la ligne "autre" d'une demande encore "demandee". */
export async function modifierDescriptionAutreConsommable(params: {
  commandeId: string;
  description: string | null;
}) {
  const { error } = await supabase
    .from('commande_consommables_lignes')
    .update({ description: params.description })
    .eq('commande_id', params.commandeId)
    .eq('type', 'autre');
  if (error) throw error;
}

/** Le local marque la demande comme envoyée (préparée/remise au pop-up). */
export async function marquerConsommablesEnvoyee(params: { commandeId: string; profileId: string }) {
  const { error } = await supabase
    .from('commandes_consommables')
    .update({ statut: 'envoyee', envoyee_par: params.profileId, envoyee_at: new Date().toISOString() })
    .eq('id', params.commandeId);
  if (error) throw error;
}

/** Le pop-up confirme avoir récupéré la commande de consommables. */
export async function marquerConsommablesRecue(params: { commandeId: string; profileId: string }) {
  const { error } = await supabase
    .from('commandes_consommables')
    .update({ statut: 'recue', recue_par: params.profileId, recue_at: new Date().toISOString() })
    .eq('id', params.commandeId);
  if (error) throw error;
}
