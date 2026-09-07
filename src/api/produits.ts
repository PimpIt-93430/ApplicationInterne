import { supabase } from './supabaseClient';
import type { CategorieProduit, CommandeProduitLigne, CommandeProduits } from '@/types/database.types';

export interface CommandeProduitsAvecLignes {
  commande: CommandeProduits;
  lignes: CommandeProduitLigne[];
}

/** Commande de Produits (chaussures/coques/sacs) en cours (pas encore reçue) pour ce pop-up, avec
 * ses lignes. null si aucune commande en vol. */
export async function fetchCommandeActiveProduits(popUpId: string): Promise<CommandeProduitsAvecLignes | null> {
  const { data, error } = await supabase
    .from('commandes_produits')
    .select('*, lignes:commande_produits_lignes(*)')
    .eq('pop_up_id', popUpId)
    .neq('statut', 'recue')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { lignes, ...commande } = data as unknown as CommandeProduits & { lignes: CommandeProduitLigne[] };
  return { commande, lignes };
}

/** Crée une demande de Produits (statut "demandee") avec ses lignes — une seule commande en vol à
 * la fois par pop-up (contrainte en base, migration 0098). */
export async function envoyerCommandeProduits(params: {
  popUpId: string;
  profileId: string;
  lignes: { categorie: CategorieProduit; produitId: string; libelle: string; quantite: number }[];
}): Promise<string> {
  const { popUpId, profileId, lignes } = params;
  const { data: commande, error: errorCommande } = await supabase
    .from('commandes_produits')
    .insert({ pop_up_id: popUpId, demandee_par: profileId })
    .select('id')
    .single();
  if (errorCommande) throw errorCommande;

  const { error: errorLignes } = await supabase.from('commande_produits_lignes').insert(
    lignes.map((l) => ({
      commande_id: commande.id,
      categorie: l.categorie,
      produit_id: l.produitId,
      libelle: l.libelle,
      quantite: l.quantite,
    })),
  );
  if (errorLignes) throw errorLignes;

  return commande.id;
}

/** Annule une demande pas encore prise en charge par le local (statut "demandee" uniquement, RLS
 * migration 0098) — même garde-fou que pour les pin's/consommables. */
export async function annulerCommandeProduits(commandeId: string): Promise<void> {
  const { error: errorLignes } = await supabase.from('commande_produits_lignes').delete().eq('commande_id', commandeId);
  if (errorLignes) throw errorLignes;

  const { data, error } = await supabase.from('commandes_produits').delete().eq('id', commandeId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Suppression bloquée (commande déjà prise en charge ?)');
}

/** Coche/décoche une ligne pendant la préparation par le local. */
export async function basculerLigneCommandeProduitFait(ligneId: string, fait: boolean) {
  const { error } = await supabase.from('commande_produits_lignes').update({ fait }).eq('id', ligneId);
  if (error) throw error;
}

/** "Tout cocher"/"tout décocher" en un seul aller-retour. */
export async function basculerToutesLignesCommandeProduits(commandeId: string, fait: boolean) {
  const { error } = await supabase.from('commande_produits_lignes').update({ fait }).eq('commande_id', commandeId);
  if (error) throw error;
}

/** Le local marque la demande comme envoyée (préparée/remise au pop-up) — même principe que pour
 * les consommables (migration 0043), pas d'étape "prête" intermédiaire séparée. */
export async function marquerCommandeProduitsEnvoyee(params: { commandeId: string; profileId: string }) {
  const { error } = await supabase
    .from('commandes_produits')
    .update({ statut: 'envoyee', envoyee_par: params.profileId, envoyee_at: new Date().toISOString() })
    .eq('id', params.commandeId);
  if (error) throw error;
}

/** Le pop-up confirme avoir récupéré la commande. */
export async function marquerCommandeProduitsRecue(params: { commandeId: string; profileId: string }) {
  const { error } = await supabase
    .from('commandes_produits')
    .update({ statut: 'recue', recue_par: params.profileId, recue_at: new Date().toISOString() })
    .eq('id', params.commandeId);
  if (error) throw error;
}

export interface CommandeProduitsResume {
  commande: CommandeProduits;
  popUpNom: string;
  nbLignes: number;
  nbFaites: number;
}

/** Toutes les commandes de Produits en attente de préparation (statut "demandee"), tous pop-ups
 * confondus — sert à l'onglet "Commandes" du Local. */
export async function fetchCommandesEnAttenteLocalProduits(): Promise<CommandeProduitsResume[]> {
  const { data, error } = await supabase
    .from('commandes_produits')
    .select('*, pop_up:pop_ups(nom), lignes:commande_produits_lignes(fait)')
    .eq('statut', 'demandee')
    .order('demandee_at', { ascending: true });
  if (error) throw error;
  return (
    data as unknown as (CommandeProduits & { pop_up: { nom: string } | null; lignes: { fait: boolean }[] })[]
  ).map((c) => {
    const { pop_up, lignes, ...commande } = c;
    return { commande, popUpNom: pop_up?.nom ?? '?', nbLignes: lignes.length, nbFaites: lignes.filter((l) => l.fait).length };
  });
}

/** Détail d'une commande pour l'écran de préparation du local. */
export async function fetchCommandeDetailProduits(
  commandeId: string,
): Promise<CommandeProduitsAvecLignes & { popUpNom: string }> {
  const { data, error } = await supabase
    .from('commandes_produits')
    .select('*, pop_up:pop_ups(nom), lignes:commande_produits_lignes(*)')
    .eq('id', commandeId)
    .single();
  if (error) throw error;
  const { pop_up, lignes, ...commande } = data as unknown as CommandeProduits & {
    pop_up: { nom: string } | null;
    lignes: CommandeProduitLigne[];
  };
  return { commande, popUpNom: pop_up?.nom ?? '?', lignes };
}

export interface CommandeProduitsHistoriqueResume {
  commande: CommandeProduits;
  nbLignes: number;
}

/** Historique des commandes de Produits d'un pop-up (tous statuts), du plus récent au plus ancien. */
export async function fetchCommandesTermineesProduits(popUpId: string): Promise<CommandeProduitsHistoriqueResume[]> {
  const { data, error } = await supabase
    .from('commandes_produits')
    .select('*, lignes:commande_produits_lignes(id)')
    .eq('pop_up_id', popUpId)
    .order('demandee_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as (CommandeProduits & { lignes: { id: string }[] })[]).map((c) => {
    const { lignes, ...commande } = c;
    return { commande, nbLignes: lignes.length };
  });
}
