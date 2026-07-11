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

export interface LigneReapprovisionnement {
  pin: StockPin;
  quantite: number;
}

/** Ce qu'il manque, pin par pin, sur les cases déjà comptées de CE pop-up (pas les autres — le
 * réapprovisionnement se prépare pour un lieu précis) : seuil cible moins la dernière quantité
 * connue de chaque case contenant ce pin, sommé sur toutes ses cases dans ce pop-up. */
export function calculerReapprovisionnement(grille: CaseGrille[]): LigneReapprovisionnement[] {
  const parPin = new Map<string, LigneReapprovisionnement>();

  for (const caseGrille of grille) {
    for (const contenu of caseGrille.contenus) {
      const seuil = contenu.pin.seuil_cible;
      if (!seuil || seuil <= 0) continue;

      const quantiteActuelle =
        contenu.quantiteRestante ??
        (contenu.pourcentageRestant !== null ? (contenu.pourcentageRestant / 100) * seuil : null);
      if (quantiteActuelle === null) continue;

      const manque = Math.round(seuil - quantiteActuelle);
      if (manque <= 0) continue;

      const existant = parPin.get(contenu.pin.id);
      if (existant) existant.quantite += manque;
      else parPin.set(contenu.pin.id, { pin: contenu.pin, quantite: manque });
    }
  }

  return [...parPin.values()].sort((a, b) => b.quantite - a.quantite);
}

/**
 * Valide le réapprovisionnement d'un pop-up : une fois que tout a été effectivement ramené, on
 * repart à 0 pour le prochain cycle de comptage — remet toutes les cases de ce pop-up à "Jamais
 * compté" et efface leur historique de comptage (le rapport redevient vide pour ce lieu).
 * `stock_a_ramener` de chaque pin concerné est recalculé : ça ne descend à 0 que si ce pin n'a
 * pas aussi un manque dans un AUTRE pop-up (auquel cas il reste correctement dans la commande).
 */
export async function validerReapprovisionnement(popUpId: string) {
  const { data: boites, error: errorBoites } = await supabase
    .from('pop_up_pin_boites')
    .select('id, pin_id')
    .eq('pop_up_id', popUpId);
  if (errorBoites) throw errorBoites;
  if (!boites || boites.length === 0) return;

  const { error: errorReset } = await supabase
    .from('pop_up_pin_boites')
    .update({ poids_pese: null, quantite_restante: null, pourcentage_restant: null })
    .eq('pop_up_id', popUpId);
  if (errorReset) throw errorReset;

  const { error: errorMouvements } = await supabase
    .from('stock_mouvements')
    .delete()
    .eq('pop_up_id', popUpId)
    .in('type', ['pesee', 'estimation']);
  if (errorMouvements) throw errorMouvements;

  const pinIds = [...new Set(boites.map((b) => b.pin_id))];
  for (const pinId of pinIds) {
    await recalculerStockARamener(pinId);
  }
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

  // Retirer une case comptée change ce qui manque ; en ajouter une neuve (pas encore comptée) ne
  // change rien tout de suite, mais on recalcule quand même par simplicité et cohérence.
  for (const pinId of new Set([...aRetirer, ...aAjouter])) {
    await recalculerStockARamener(pinId);
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
  await recalculerStockARamener(pinId);
}

/**
 * Efface le comptage d'un pin dans une case (remet poids/quantité/pourcentage à null, retour à
 * "Jamais compté") — ne touche pas à l'historique (stock_mouvements reste tel quel, trace
 * immuable de ce qui a été compté et quand), seul l'état courant de la case est réinitialisé.
 */
export async function supprimerComptagePinDansCase(params: { boiteId: string; pinId: string }) {
  const { boiteId, pinId } = params;
  const { error } = await supabase
    .from('pop_up_pin_boites')
    .update({ poids_pese: null, quantite_restante: null, pourcentage_restant: null })
    .eq('id', boiteId);
  if (error) throw error;
  await recalculerStockARamener(pinId);
}

/**
 * Après suppression d'un comptage historique pour un pin dans une case, remet l'état courant de
 * cette case (pop_up_pin_boites) en cohérence avec ce qu'il reste dans l'historique : reprend le
 * dernier mouvement restant pour ce pin dans cette case, ou repasse à "Jamais compté" s'il n'en
 * reste plus aucun (ex. la suppression portait bien sur le comptage le plus récent).
 */
async function recalculerEtatCaseDepuisHistorique(params: {
  popUpId: string;
  casePosition: string;
  pinId: string;
}) {
  const { popUpId, casePosition, pinId } = params;

  const { data: boites, error: errorBoite } = await supabase
    .from('pop_up_pin_boites')
    .select('id')
    .eq('pop_up_id', popUpId)
    .eq('case_position', casePosition)
    .eq('pin_id', pinId)
    .limit(1);
  if (errorBoite) throw errorBoite;
  const boite = boites?.[0];
  if (!boite) return; // ce pin n'est plus (ou déjà plus) dans cette case

  const { data: derniers, error: errorDernier } = await supabase
    .from('stock_mouvements')
    .select('type, poids_pese, quantite_calculee, pourcentage_restant')
    .eq('pop_up_id', popUpId)
    .eq('case_position', casePosition)
    .eq('pin_id', pinId)
    .in('type', ['pesee', 'estimation'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (errorDernier) throw errorDernier;
  const dernier = derniers?.[0];

  const changements = !dernier
    ? { poids_pese: null, quantite_restante: null, pourcentage_restant: null }
    : dernier.type === 'estimation'
      ? { pourcentage_restant: dernier.pourcentage_restant, poids_pese: null, quantite_restante: null }
      : { poids_pese: dernier.poids_pese, quantite_restante: dernier.quantite_calculee, pourcentage_restant: null };

  const { error: errorMaj } = await supabase.from('pop_up_pin_boites').update(changements).eq('id', boite.id);
  if (errorMaj) throw errorMaj;

  await recalculerStockARamener(pinId);
}

/**
 * Supprime tout l'historique de comptage d'une case pour un jour donné (ex. "le comptage de la
 * boîte A1 du 11 juillet") — contrairement à `supprimerComptagePinDansCase`, ça touche bien
 * l'historique (stock_mouvements), pas seulement l'état courant, puisque c'est justement cette
 * trace-là que la personne veut faire disparaître du rapport.
 */
export async function supprimerComptageBoiteJour(params: {
  popUpId: string;
  casePosition: string;
  jourISO: string;
}) {
  const { popUpId, casePosition, jourISO } = params;

  const { data: mouvements, error: errorFetch } = await supabase
    .from('stock_mouvements')
    .select('id, pin_id, created_at')
    .eq('pop_up_id', popUpId)
    .eq('case_position', casePosition)
    .in('type', ['pesee', 'estimation']);
  if (errorFetch) throw errorFetch;

  const aSupprimer = (mouvements ?? []).filter((m) => m.created_at.slice(0, 10) === jourISO);
  if (aSupprimer.length === 0) return;

  const { error: errorDelete } = await supabase
    .from('stock_mouvements')
    .delete()
    .in(
      'id',
      aSupprimer.map((m) => m.id),
    );
  if (errorDelete) throw errorDelete;

  const pinIds = [...new Set(aSupprimer.map((m) => m.pin_id))];
  for (const pinId of pinIds) {
    await recalculerEtatCaseDepuisHistorique({ popUpId, casePosition, pinId });
  }
}

/**
 * Recalcule `stock_a_ramener` d'un pin : la somme, sur toutes ses cases (tous pop-ups confondus),
 * du manque par rapport au seuil cible — d'après la dernière quantité connue de chaque case
 * (pesée, ou estimation en % ramenée au seuil comme référence de "plein"). Appelé à chaque
 * comptage pour rester automatiquement à jour, remplaçant la saisie manuelle initialement prévue
 * (cf. migration 0010 : "sera automatisé plus tard en fonction de ce qui est effectivement ramené").
 */
export async function recalculerStockARamener(pinId: string) {
  const { data: pin, error: errorPin } = await supabase
    .from('stock_pins')
    .select('seuil_cible')
    .eq('id', pinId)
    .single();
  if (errorPin) throw errorPin;

  const seuil = pin.seuil_cible;
  if (!seuil || seuil <= 0) {
    const { error } = await supabase.from('stock_pins').update({ stock_a_ramener: 0 }).eq('id', pinId);
    if (error) throw error;
    return;
  }

  const { data: boites, error: errorBoites } = await supabase
    .from('pop_up_pin_boites')
    .select('quantite_restante, pourcentage_restant')
    .eq('pin_id', pinId);
  if (errorBoites) throw errorBoites;

  const manqueTotal = (boites ?? []).reduce((total, boite) => {
    const quantiteActuelle =
      boite.quantite_restante ??
      (boite.pourcentage_restant !== null ? (boite.pourcentage_restant / 100) * seuil : null);
    if (quantiteActuelle === null) return total;
    return total + Math.max(0, seuil - quantiteActuelle);
  }, 0);

  const { error } = await supabase
    .from('stock_pins')
    .update({ stock_a_ramener: Math.round(manqueTotal) })
    .eq('id', pinId);
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

  await recalculerStockARamener(pinId);
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

  await recalculerStockARamener(pinId);
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
  pin: { nom: string; seuil_cible: number | null } | null;
}

/**
 * Historique des comptages (pesées + estimations) d'un pop-up, pin inclus (avec son seuil cible,
 * pour calculer le manque directement dans le rapport) : sert de trace jour par jour / boîte par
 * boîte pour le rapport et la liste de ce qu'il faut ramener du local.
 */
export async function fetchMouvementsComptage(popUpId: string): Promise<MouvementComptage[]> {
  const { data, error } = await supabase
    .from('stock_mouvements')
    .select('*, pin:stock_pins(nom, seuil_cible)')
    .eq('pop_up_id', popUpId)
    .in('type', ['pesee', 'estimation'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as MouvementComptage[];
}

/** Quantité restante déduite d'un mouvement de comptage : directe si pesé, sinon estimée en % du
 * seuil cible (utilisé comme référence de "plein" en l'absence de sac à peser). */
export function quantiteRestanteMouvement(mouvement: MouvementComptage): number | null {
  if (mouvement.quantite_calculee !== null) return mouvement.quantite_calculee;
  const seuil = mouvement.pin?.seuil_cible;
  if (mouvement.pourcentage_restant !== null && seuil) return (mouvement.pourcentage_restant / 100) * seuil;
  return null;
}

/** Manque par rapport au seuil cible pour un mouvement de comptage (0 si pas de seuil défini ou
 * si déjà au niveau voulu) — c'est ce qui alimente la liste "à ramener du local" du rapport. */
export function manqueMouvement(mouvement: MouvementComptage): number {
  const seuil = mouvement.pin?.seuil_cible;
  const quantite = quantiteRestanteMouvement(mouvement);
  if (!seuil || quantite === null) return 0;
  return Math.max(0, Math.round(seuil - quantite));
}
