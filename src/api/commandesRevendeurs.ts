import { comparerParEmplacement } from './stock';
import { supabase } from './supabaseClient';
import type { CommandeRevendeur, CommandeRevendeurLigne, StockPin } from '@/types/database.types';

export interface CommandeRevendeurAvecLignes {
  commande: CommandeRevendeur;
  lignes: (CommandeRevendeurLigne & { pin: StockPin | null })[];
}

export interface CommandeRevendeurResume {
  commande: CommandeRevendeur;
  nbLignes: number;
  nbFaites: number;
}

/** Commandes revendeurs pas encore traitées, pour l'onglet "Commandes" du Local — retour
 * utilisateur du 2026-09-21 : doivent apparaître dans "Voir la commande" comme les pin's/produits/
 * consommables, même principe que fetchCommandesEnAttenteLocal (pin's, cf. api/stock.ts). */
export async function fetchCommandesRevendeursEnAttenteLocal(): Promise<CommandeRevendeurResume[]> {
  const { data, error } = await supabase
    .from('commandes_revendeurs')
    .select('*, lignes:commandes_revendeurs_lignes(fait)')
    .eq('statut', 'nouvelle')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as (CommandeRevendeur & { lignes: { fait: boolean }[] })[]).map((c) => {
    const { lignes, ...commande } = c;
    return { commande, nbLignes: lignes.length, nbFaites: lignes.filter((l) => l.fait).length };
  });
}

/** Détail d'une commande revendeur pour l'écran de préparation du local — pin complet (photo,
 * emplacement) rejoint via airtable_record_id, même principe que chargerCommandesRevendeurs côté
 * Hub (app/(hub)/commandes-revendeurs/actions.ts). Triée par emplacement physique comme les
 * commandes pin's classiques (fetchCommandeDetail). */
export async function fetchCommandeRevendeurDetail(commandeId: string): Promise<CommandeRevendeurAvecLignes> {
  const { data: commande, error: errorCommande } = await supabase
    .from('commandes_revendeurs')
    .select('*')
    .eq('id', commandeId)
    .single();
  if (errorCommande) throw errorCommande;

  const { data: lignes, error: errorLignes } = await supabase
    .from('commandes_revendeurs_lignes')
    .select('*')
    .eq('commande_id', commandeId);
  if (errorLignes) throw errorLignes;

  const idsAirtable = [...new Set((lignes ?? []).map((l) => l.airtable_record_id).filter((v): v is string => !!v))];
  const { data: pins } =
    idsAirtable.length > 0
      ? await supabase.from('stock_pins').select('*').in('airtable_record_id', idsAirtable)
      : { data: [] };
  const pinParAirtableId = new Map((pins ?? []).map((p) => [p.airtable_record_id, p as StockPin]));

  const lignesAvecPin = (lignes as CommandeRevendeurLigne[]).map((l) => ({
    ...l,
    pin: l.airtable_record_id ? (pinParAirtableId.get(l.airtable_record_id) ?? null) : null,
  }));
  lignesAvecPin.sort((a, b) => (a.pin && b.pin ? comparerParEmplacement(a.pin, b.pin) : 0));

  return { commande: commande as CommandeRevendeur, lignes: lignesAvecPin };
}

/** Coche/décoche un seul pin, enregistré immédiatement — même principe que
 * basculerLigneCommandeFaite (pin's classiques). Pas d'impact sur stock_pins.stock_general ici :
 * contrairement aux commandes pop-up, rien ne le décrémente non plus à la création de la commande
 * revendeur (app/revendeurs), donc pas de raison de le faire seulement à la préparation — à
 * reconsidérer si le suivi de stock doit un jour inclure les ventes revendeurs. */
export async function basculerLigneCommandeRevendeurFait(ligneId: string, fait: boolean) {
  const { error } = await supabase.from('commandes_revendeurs_lignes').update({ fait }).eq('id', ligneId);
  if (error) throw error;
}

export async function basculerToutesLignesCommandeRevendeur(commandeId: string, fait: boolean) {
  const { error } = await supabase.from('commandes_revendeurs_lignes').update({ fait }).eq('commande_id', commandeId);
  if (error) throw error;
}

/** Même action que marquerCommandeRevendeurTraitee côté Hub (app/(hub)/commandes-revendeurs/
 * actions.ts) — dupliquée ici plutôt que partagée, les deux projets sont des codebases séparées. */
export async function marquerCommandeRevendeurTraitee(commandeId: string) {
  const { error, data } = await supabase
    .from('commandes_revendeurs')
    .update({ statut: 'traitee' })
    .eq('id', commandeId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Modification bloquée (droits insuffisants ?)');
}
