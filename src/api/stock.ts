import { supabase } from './supabaseClient';
import type { PopUpPinBoite, StockMouvement, StockPin, TypeMouvementStock } from '@/types/database.types';

const COLONNES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const LIGNES = [1, 2, 3] as const;

/** Les 21 positions physiques de la grille, dans l'ordre d'affichage (A1, A2, A3, B1...G3). */
export const POSITIONS_GRILLE: string[] = COLONNES.flatMap((colonne) =>
  LIGNES.map((ligne) => `${colonne}${ligne}`),
);

export interface ContenuCase {
  boiteId: string;
  pin: StockPin;
  poidsPese: number | null;
  quantiteRestante: number | null;
  pourcentageRestant: number | null;
  updatedAt: string;
}

export interface CaseGrille {
  casePosition: string;
  contenus: ContenuCase[];
}

export type StatutCase = 'vide' | 'partiel' | 'complet';

/** Une case-pin est "comptée" si elle a été pesée ou estimée en % au moins une fois. */
export function estContenuCompte(contenu: ContenuCase): boolean {
  return contenu.quantiteRestante !== null || contenu.pourcentageRestant !== null;
}

export function statutCase(contenus: ContenuCase[]): StatutCase {
  if (contenus.length === 0) return 'vide';
  return contenus.every(estContenuCompte) ? 'complet' : 'partiel';
}

export async function fetchPins(): Promise<StockPin[]> {
  const { data, error } = await supabase.from('stock_pins').select('*').eq('actif', true).order('nom');
  if (error) throw error;
  return data;
}

export async function fetchPin(id: string): Promise<StockPin> {
  const { data, error } = await supabase.from('stock_pins').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function fetchGrillePopUp(popUpId: string): Promise<CaseGrille[]> {
  const { data, error } = await supabase
    .from('pop_up_pin_boites')
    .select('*, pin:stock_pins(*)')
    .eq('pop_up_id', popUpId);
  if (error) throw error;

  const parPosition = new Map<string, ContenuCase[]>();
  for (const boite of (data ?? []) as (PopUpPinBoite & { pin: StockPin })[]) {
    const liste = parPosition.get(boite.case_position) ?? [];
    liste.push({
      boiteId: boite.id,
      pin: boite.pin,
      poidsPese: boite.poids_pese,
      quantiteRestante: boite.quantite_restante,
      pourcentageRestant: boite.pourcentage_restant,
      updatedAt: boite.updated_at,
    });
    parPosition.set(boite.case_position, liste);
  }

  return POSITIONS_GRILLE.map((casePosition) => ({
    casePosition,
    contenus: parPosition.get(casePosition) ?? [],
  }));
}

/**
 * Remplace l'ensemble des pins attribués à une case par `pinIdsVoulus` : calcule le diff avec
 * `pinIdsActuels` (déduit de la grille déjà chargée côté appelant), supprime les pins retirés et
 * insère les pins ajoutés. Les pins qui restent ne sont pas touchés (leur pesée est conservée).
 */
export async function attribuerPinsACase(params: {
  popUpId: string;
  casePosition: string;
  pinIdsActuels: string[];
  pinIdsVoulus: string[];
  profileId: string;
}) {
  const { popUpId, casePosition, pinIdsActuels, pinIdsVoulus, profileId } = params;
  const actuels = new Set(pinIdsActuels);
  const voulus = new Set(pinIdsVoulus);

  const aRetirer = pinIdsActuels.filter((id) => !voulus.has(id));
  const aAjouter = pinIdsVoulus.filter((id) => !actuels.has(id));

  if (aRetirer.length > 0) {
    const { error } = await supabase
      .from('pop_up_pin_boites')
      .delete()
      .eq('pop_up_id', popUpId)
      .eq('case_position', casePosition)
      .in('pin_id', aRetirer);
    if (error) throw error;
  }

  if (aAjouter.length > 0) {
    const { error } = await supabase.from('pop_up_pin_boites').insert(
      aAjouter.map((pinId) => ({
        pop_up_id: popUpId,
        pin_id: pinId,
        case_position: casePosition,
        maj_par: profileId,
      })),
    );
    if (error) throw error;
  }
}

export async function retirerPinDeCase(params: { popUpId: string; casePosition: string; pinId: string }) {
  const { popUpId, casePosition, pinId } = params;
  const { error } = await supabase
    .from('pop_up_pin_boites')
    .delete()
    .eq('pop_up_id', popUpId)
    .eq('case_position', casePosition)
    .eq('pin_id', pinId);
  if (error) throw error;
}

/**
 * Enregistre la pesée d'un pin dans une case. `poidsUnitaire` est le poids catalogue d'un lot de
 * 10 pins (pesé ainsi pour plus de précision) : quantiteRestante = (poidsPese / poidsUnitaire) * 10.
 */
export async function peserPinDansCase(params: {
  boiteId: string;
  pinId: string;
  popUpId: string;
  casePosition: string;
  poidsUnitaire: number;
  poidsPese: number;
  profileId: string;
}) {
  const { boiteId, pinId, popUpId, casePosition, poidsUnitaire, poidsPese, profileId } = params;
  if (!poidsUnitaire || poidsUnitaire <= 0) {
    throw new Error('Poids unitaire manquant pour ce pin : impossible de calculer la quantité.');
  }
  const quantiteRestante = (poidsPese / poidsUnitaire) * 10;

  const { error: errorMaj } = await supabase
    .from('pop_up_pin_boites')
    .update({
      poids_pese: poidsPese,
      quantite_restante: quantiteRestante,
      pourcentage_restant: null,
      maj_par: profileId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', boiteId);
  if (errorMaj) throw errorMaj;

  const { error: errorMouvement } = await supabase.from('stock_mouvements').insert({
    pin_id: pinId,
    pop_up_id: popUpId,
    type: 'pesee' as TypeMouvementStock,
    poids_pese: poidsPese,
    quantite_calculee: quantiteRestante,
    case_position: casePosition,
    profile_id: profileId,
  });
  if (errorMouvement) throw errorMouvement;
}

/**
 * Enregistre une estimation en pourcentage (0-100) quand il n'y a plus de sac à peser pour ce
 * pin dans cette case : remplace la pesée au poids comme mesure "actuelle" de ce qu'il reste.
 */
export async function estimerPourcentagePinDansCase(params: {
  boiteId: string;
  pinId: string;
  popUpId: string;
  casePosition: string;
  pourcentage: number;
  profileId: string;
}) {
  const { boiteId, pinId, popUpId, casePosition, pourcentage, profileId } = params;

  const { error: errorMaj } = await supabase
    .from('pop_up_pin_boites')
    .update({
      pourcentage_restant: pourcentage,
      poids_pese: null,
      quantite_restante: null,
      maj_par: profileId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', boiteId);
  if (errorMaj) throw errorMaj;

  const { error: errorMouvement } = await supabase.from('stock_mouvements').insert({
    pin_id: pinId,
    pop_up_id: popUpId,
    type: 'estimation' as TypeMouvementStock,
    pourcentage_restant: pourcentage,
    case_position: casePosition,
    profile_id: profileId,
  });
  if (errorMouvement) throw errorMouvement;
}

export async function ajusterStockGeneral(params: {
  pinId: string;
  delta: number;
  note: string;
  profileId: string;
}) {
  const { pinId, delta, note, profileId } = params;
  const pin = await fetchPin(pinId);
  const nouvelleValeur = Math.max(0, pin.stock_general + delta);

  const { error: errorMaj } = await supabase
    .from('stock_pins')
    .update({ stock_general: nouvelleValeur, updated_at: new Date().toISOString() })
    .eq('id', pinId);
  if (errorMaj) throw errorMaj;

  const { error: errorMouvement } = await supabase.from('stock_mouvements').insert({
    pin_id: pinId,
    pop_up_id: null,
    type: (delta >= 0 ? 'reception' : 'ajustement') as TypeMouvementStock,
    quantite_delta: delta,
    note,
    profile_id: profileId,
  });
  if (errorMouvement) throw errorMouvement;
}

export async function creerPin(params: {
  nom: string;
  fournisseur?: string;
  skuPimpit?: string;
  skuFournisseur?: string;
  seuilCible?: number;
  poidsUnitaire?: number;
  prixRevente?: number;
}): Promise<StockPin> {
  const { data, error } = await supabase
    .from('stock_pins')
    .insert({
      nom: params.nom,
      fournisseur: params.fournisseur ?? null,
      sku_pimpit: params.skuPimpit ?? null,
      sku_fournisseur: params.skuFournisseur ?? null,
      seuil_cible: params.seuilCible ?? null,
      poids_unitaire: params.poidsUnitaire ?? null,
      prix_revente_ht: params.prixRevente ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function modifierPin(id: string, params: Partial<StockPin>) {
  const { error } = await supabase
    .from('stock_pins')
    .update({ ...params, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchMouvements(params: {
  pinId?: string;
  popUpId?: string;
  limite?: number;
}): Promise<StockMouvement[]> {
  let requete = supabase
    .from('stock_mouvements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params.limite ?? 50);
  if (params.pinId) requete = requete.eq('pin_id', params.pinId);
  if (params.popUpId) requete = requete.eq('pop_up_id', params.popUpId);

  const { data, error } = await requete;
  if (error) throw error;
  return data;
}

export interface MouvementComptage extends StockMouvement {
  pin: { nom: string } | null;
}

/**
 * Historique des comptages (pesées + estimations) d'un pop-up, pin inclus : sert de trace
 * jour par jour / boîte par boîte pour le rapport et le futur fichier de réapprovisionnement.
 */
export async function fetchMouvementsComptage(popUpId: string): Promise<MouvementComptage[]> {
  const { data, error } = await supabase
    .from('stock_mouvements')
    .select('*, pin:stock_pins(nom)')
    .eq('pop_up_id', popUpId)
    .in('type', ['pesee', 'estimation'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as MouvementComptage[];
}
