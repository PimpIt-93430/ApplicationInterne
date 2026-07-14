import { decode } from 'base64-arraybuffer';

import { supabase } from './supabaseClient';
import type {
  PopUpBoiteRemplissage,
  PopUpPinBoite,
  StockMouvement,
  StockPin,
  TypeMouvementStock,
} from '@/types/database.types';

const COLONNES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const LIGNES = [1, 2, 3] as const;

/** Les 21 positions physiques de la grille, dans l'ordre d'affichage (A1, A2, A3, B1...G3). */
export const POSITIONS_GRILLE: string[] = COLONNES.flatMap((colonne) =>
  LIGNES.map((ligne) => `${colonne}${ligne}`),
);

export interface ContenuCase {
  boiteId: string;
  pin: StockPin;
  aCommander: boolean;
  updatedAt: string;
}

export interface CaseGrille {
  casePosition: string;
  contenus: ContenuCase[];
}

export type StatutBoiteCommande = 'vide' | 'ok' | 'a_commander';

export function statutBoiteCommande(contenus: ContenuCase[]): StatutBoiteCommande {
  if (contenus.length === 0) return 'vide';
  return contenus.some((c) => c.aCommander) ? 'a_commander' : 'ok';
}

export interface LigneCommande {
  pin: StockPin;
  nbBoites: number;
}

/** Regroupe par pin les cases marquées "à commander" sur CE pop-up (pas les autres — la commande
 * se prépare pour un lieu précis), avec le nombre de boîtes concernées pour ce pin. */
export function calculerCommandes(grille: CaseGrille[]): LigneCommande[] {
  const parPin = new Map<string, LigneCommande>();

  for (const caseGrille of grille) {
    for (const contenu of caseGrille.contenus) {
      if (!contenu.aCommander) continue;
      const existant = parPin.get(contenu.pin.id);
      if (existant) existant.nbBoites += 1;
      else parPin.set(contenu.pin.id, { pin: contenu.pin, nbBoites: 1 });
    }
  }

  return [...parPin.values()].sort((a, b) => b.nbBoites - a.nbBoites);
}

/** Valide la réception d'une commande pour un pop-up : une fois les pins effectivement ramenés,
 * on repart à zéro pour ce lieu — retire le flag "à commander" de toutes ses cases. */
export async function validerCommandesRecues(popUpId: string) {
  const { error } = await supabase
    .from('pop_up_pin_boites')
    .update({ a_commander: false })
    .eq('pop_up_id', popUpId);
  if (error) throw error;
}

/** Bascule le flag "à commander" d'un pin dans une case précise — décision manuelle ("le sac a
 * moins de 20 pins ?"), pas de calcul automatique. */
export async function basculerCommandePin(params: {
  boiteId: string;
  aCommander: boolean;
  profileId: string;
}) {
  const { boiteId, aCommander, profileId } = params;
  const { error } = await supabase
    .from('pop_up_pin_boites')
    .update({ a_commander: aCommander, maj_par: profileId, updated_at: new Date().toISOString() })
    .eq('id', boiteId);
  if (error) throw error;
}

/** Enregistre qu'une boîte vient d'être remplie — traçabilité "qui, quand", indépendante des
 * flags "à commander" (on peut remplir une boîte sans rien commander, et commander en plein rush
 * sans faire un remplissage complet). */
export async function validerRemplissageBoite(params: {
  popUpId: string;
  casePosition: string;
  profileId: string;
}) {
  const { popUpId, casePosition, profileId } = params;
  const { error } = await supabase
    .from('pop_up_boite_remplissages')
    .insert({ pop_up_id: popUpId, case_position: casePosition, profile_id: profileId });
  if (error) throw error;
}

export interface DernierRemplissage {
  id: string;
  casePosition: string;
  profileNom: string;
  createdAt: string;
}

/** Dernier remplissage connu par case, pour ce pop-up — affiché dans l'écran de case et le
 * rapport. `fetchRemplissages` (non filtré par case) sert au rapport groupé par jour. */
export async function fetchDerniersRemplissages(popUpId: string): Promise<DernierRemplissage[]> {
  const lignes = await fetchRemplissages(popUpId);
  const parCase = new Map<string, DernierRemplissage>();
  for (const ligne of lignes) {
    if (!parCase.has(ligne.casePosition)) parCase.set(ligne.casePosition, ligne);
  }
  return [...parCase.values()];
}

/** Historique complet des remplissages d'un pop-up, du plus récent au plus ancien. */
export async function fetchRemplissages(popUpId: string): Promise<DernierRemplissage[]> {
  const { data, error } = await supabase
    .from('pop_up_boite_remplissages')
    .select('id, case_position, created_at, profile:profiles(nom_complet)')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as (PopUpBoiteRemplissage & { profile: { nom_complet: string } | null })[]).map(
    (r) => ({
      id: r.id,
      casePosition: r.case_position,
      profileNom: r.profile?.nom_complet ?? '?',
      createdAt: r.created_at,
    }),
  );
}

/** Supprime un remplissage du rapport (correction d'une erreur de saisie) — réservé aux admins
 * côté RLS (migration 0027), n'affecte pas les flags "à commander". */
export async function supprimerRemplissage(id: string) {
  const { error } = await supabase.from('pop_up_boite_remplissages').delete().eq('id', id);
  if (error) throw error;
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

export interface AttributionPin {
  pin_id: string;
  pop_up_id: string;
  case_position: string;
}

/** Toutes les cases (tous pop-ups confondus) où chaque pin est actuellement attribué — sert
 * uniquement à afficher "déjà attribué ou pas" dans le catalogue, indépendamment du pop-up choisi
 * dans l'onglet Boîtes. */
export async function fetchAttributionsPins(): Promise<AttributionPin[]> {
  const { data, error } = await supabase.from('pop_up_pin_boites').select('pin_id, pop_up_id, case_position');
  if (error) throw error;
  return data;
}

export async function fetchGrillePopUp(popUpId: string): Promise<CaseGrille[]> {
  const { data, error } = await supabase
    .from('pop_up_pin_boites')
    .select('*, pin:stock_pins(*)')
    .eq('pop_up_id', popUpId);
  if (error) throw error;

  // Ordre alphabétique fixe par nom de pin (pas par a_commander) : basculer "Commander" sur un
  // pin ne doit jamais faire bouger sa place dans la liste d'une case. `id` en critère
  // secondaire (immuable) pour départager les noms identiques/égaux — sans ça, deux pins de même
  // nom peuvent se réordonner entre deux fetches selon l'ordre physique renvoyé par Postgres.
  const boitesTriees = [...((data ?? []) as (PopUpPinBoite & { pin: StockPin })[])].sort((a, b) => {
    const parNom = a.pin.nom.localeCompare(b.pin.nom);
    return parNom !== 0 ? parNom : a.id.localeCompare(b.id);
  });

  const parPosition = new Map<string, ContenuCase[]>();
  for (const boite of boitesTriees) {
    const liste = parPosition.get(boite.case_position) ?? [];
    liste.push({
      boiteId: boite.id,
      pin: boite.pin,
      aCommander: boite.a_commander,
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
  photoUrl?: string;
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
      photo_url: params.photoUrl ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Envoie une photo choisie dans la galerie vers le bucket public "stock-pins" et renvoie son URL
 * publique. `base64` vient directement de expo-image-picker (option `base64: true`), décodé en
 * ArrayBuffer pour l'upload (RN ne gère pas bien Blob/File depuis une URI locale). */
export async function uploaderPhotoPin(base64: string): Promise<string> {
  const nomFichier = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabase.storage
    .from('stock-pins')
    .upload(nomFichier, decode(base64), { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data } = supabase.storage.from('stock-pins').getPublicUrl(nomFichier);
  return data.publicUrl;
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

