import { decode } from 'base64-arraybuffer';

import { supabase } from './supabaseClient';
import type {
  CommandeHistorique,
  CommandeLigne,
  CommandePopUp,
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

/** Crée une commande à partir des pins actuellement "à commander" sur ce pop-up et l'envoie au
 * local — une seule commande "en vol" (pas encore reçue) à la fois par pop-up (contrainte en
 * base, migration 0037) : échoue si une commande précédente n'a pas encore été marquée reçue. */
export async function envoyerCommande(params: {
  popUpId: string;
  profileId: string;
  pinIds: string[];
}): Promise<string> {
  const { popUpId, profileId, pinIds } = params;
  const { data: commande, error: errorCommande } = await supabase
    .from('commandes_pop_up')
    .insert({ pop_up_id: popUpId, envoyee_par: profileId })
    .select('id')
    .single();
  if (errorCommande) throw errorCommande;

  const { error: errorLignes } = await supabase
    .from('commande_lignes')
    .insert(pinIds.map((pinId) => ({ commande_id: commande.id, pin_id: pinId })));
  if (errorLignes) throw errorLignes;

  return commande.id;
}

export interface CommandeAvecLignes {
  commande: CommandePopUp;
  lignes: (CommandeLigne & { pin: StockPin })[];
}

/** Commande en cours (pas encore reçue) pour ce pop-up, avec ses lignes — sert à afficher le
 * statut dans l'onglet Rapport (envoyée / prête à récupérer). null si aucune commande en vol. */
export async function fetchCommandeActivePopUp(popUpId: string): Promise<CommandeAvecLignes | null> {
  const { data, error } = await supabase
    .from('commandes_pop_up')
    .select('*, lignes:commande_lignes(*, pin:stock_pins(*))')
    .eq('pop_up_id', popUpId)
    .neq('statut', 'recue')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { lignes, ...commande } = data as unknown as CommandePopUp & {
    lignes: (CommandeLigne & { pin: StockPin })[];
  };
  return { commande, lignes };
}

export interface CommandeResume {
  commande: CommandePopUp;
  popUpNom: string;
  nbLignes: number;
  nbFaites: number;
}

/** Toutes les commandes en attente de préparation ou prêtes (tous pop-ups confondus) — sert à
 * l'onglet "Commandes" du Local. */
export async function fetchCommandesEnAttenteLocal(): Promise<CommandeResume[]> {
  const { data, error } = await supabase
    .from('commandes_pop_up')
    .select('*, pop_up:pop_ups(nom), lignes:commande_lignes(fait)')
    .in('statut', ['envoyee', 'prete'])
    .order('envoyee_at', { ascending: true });
  if (error) throw error;
  return (
    data as unknown as (CommandePopUp & { pop_up: { nom: string } | null; lignes: { fait: boolean }[] })[]
  ).map((c) => {
    const { pop_up, lignes, ...commande } = c;
    return {
      commande,
      popUpNom: pop_up?.nom ?? '?',
      nbLignes: lignes.length,
      nbFaites: lignes.filter((l) => l.fait).length,
    };
  });
}

/** Détail d'une commande pour l'écran de préparation du local : chaque ligne avec son pin complet
 * (photo, sku, poids, stock général restant). */
export async function fetchCommandeDetail(
  commandeId: string,
): Promise<CommandeAvecLignes & { popUpNom: string }> {
  const { data, error } = await supabase
    .from('commandes_pop_up')
    .select('*, pop_up:pop_ups(nom), lignes:commande_lignes(*, pin:stock_pins(*))')
    .eq('id', commandeId)
    .single();
  if (error) throw error;
  const { pop_up, lignes, ...commande } = data as unknown as CommandePopUp & {
    pop_up: { nom: string } | null;
    lignes: (CommandeLigne & { pin: StockPin })[];
  };
  return { commande, popUpNom: pop_up?.nom ?? '?', lignes };
}

/** Coche/décoche manuellement "fait" pour une ligne — utilisé quand le local prépare sans passer
 * par la pesée (ex. pin sans poids_unitaire renseigné, ou correction). */
export async function basculerLigneCommandeFaite(ligneId: string, fait: boolean) {
  const { error } = await supabase
    .from('commande_lignes')
    .update({ fait, updated_at: new Date().toISOString() })
    .eq('id', ligneId);
  if (error) throw error;
}

/** Le local valide la commande comme prête : historise trouvé/pas trouvé pin par pin (même table
 * que l'ancien flux, alimente le cron d'ajustement de seuil, migration 0029), puis passe la
 * commande au statut "prête" — le pop-up la voit alors comme prête à récupérer. */
export async function validerCommandePrete(params: {
  commandeId: string;
  popUpId: string;
  profileId: string;
  lignes: { pinId: string; fait: boolean }[];
}) {
  const { commandeId, popUpId, profileId, lignes } = params;

  if (lignes.length > 0) {
    const { error: errorHistorique } = await supabase.from('commandes_historique').insert(
      lignes.map((l) => ({
        pop_up_id: popUpId,
        pin_id: l.pinId,
        trouve: l.fait,
        profile_id: profileId,
      })),
    );
    if (errorHistorique) throw errorHistorique;
  }

  const { error } = await supabase
    .from('commandes_pop_up')
    .update({ statut: 'prete', preparee_par: profileId, preparee_at: new Date().toISOString() })
    .eq('id', commandeId);
  if (error) throw error;
}

/** Le pop-up confirme avoir récupéré la commande : clôt la commande et retire "à commander"
 * uniquement des cases dont le pin a été trouvé (fait = true) dans CETTE commande — les pins pas
 * trouvés doivent rester signalés "à commander" pour la prochaine commande. */
export async function marquerCommandeRecue(params: {
  commandeId: string;
  popUpId: string;
  profileId: string;
}) {
  const { commandeId, popUpId, profileId } = params;

  const { error: errorCommande } = await supabase
    .from('commandes_pop_up')
    .update({ statut: 'recue', recue_par: profileId, recue_at: new Date().toISOString() })
    .eq('id', commandeId);
  if (errorCommande) throw errorCommande;

  const { data: lignesFaites, error: errorLignes } = await supabase
    .from('commande_lignes')
    .select('pin_id')
    .eq('commande_id', commandeId)
    .eq('fait', true);
  if (errorLignes) throw errorLignes;

  const pinIdsTrouves = (lignesFaites ?? []).map((l) => l.pin_id);
  if (pinIdsTrouves.length === 0) return;

  const { error: errorBoites } = await supabase
    .from('pop_up_pin_boites')
    .update({ a_commander: false })
    .eq('pop_up_id', popUpId)
    .in('pin_id', pinIdsTrouves);
  if (errorBoites) throw errorBoites;
}

export interface LigneHistoriqueCommande {
  id: string;
  pinNom: string;
  trouve: boolean;
  profileNom: string;
  createdAt: string;
}

/** Historique complet des commandes validées d'un pop-up, du plus récent au plus ancien. */
export async function fetchHistoriqueCommandes(popUpId: string): Promise<LigneHistoriqueCommande[]> {
  const { data, error } = await supabase
    .from('commandes_historique')
    .select('id, trouve, created_at, pin:stock_pins(nom), profile:profiles(nom_complet)')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (
    data as unknown as (CommandeHistorique & {
      pin: { nom: string } | null;
      profile: { nom_complet: string } | null;
    })[]
  ).map((r) => ({
    id: r.id,
    pinNom: r.pin?.nom ?? '?',
    trouve: r.trouve,
    profileNom: r.profile?.nom_complet ?? '?',
    createdAt: r.created_at,
  }));
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

/** Historique complet des remplissages d'un pop-up, du plus récent au plus ancien — `depuis` (si
 * fourni) filtre aux remplissages postérieurs à cette date (utilisé pour repartir de zéro après
 * chaque commande envoyée, cf. `fetchRemplissagesDepuisDerniereCommande`). */
export async function fetchRemplissages(popUpId: string, depuis?: string): Promise<DernierRemplissage[]> {
  let requete = supabase
    .from('pop_up_boite_remplissages')
    .select('id, case_position, created_at, profile:profiles(nom_complet)')
    .eq('pop_up_id', popUpId)
    .order('created_at', { ascending: false });
  if (depuis) requete = requete.gt('created_at', depuis);
  const { data, error } = await requete;
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

/** Rapport de l'onglet "Rapport" : remplissages depuis la dernière commande envoyée pour ce
 * pop-up (tous statuts confondus — envoyée, prête ou déjà reçue), pour repartir de zéro à chaque
 * nouvel envoi sans perdre l'historique complet en base (rien n'est supprimé, juste filtré ici).
 * S'il n'y a jamais eu de commande, retourne tout l'historique. */
export async function fetchRemplissagesDepuisDerniereCommande(popUpId: string): Promise<DernierRemplissage[]> {
  const { data: derniereCommande, error } = await supabase
    .from('commandes_pop_up')
    .select('envoyee_at')
    .eq('pop_up_id', popUpId)
    .order('envoyee_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return fetchRemplissages(popUpId, derniereCommande?.envoyee_at ?? undefined);
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
  a_commander: boolean;
}

/** Toutes les cases (tous pop-ups confondus) où chaque pin est actuellement attribué — sert à
 * afficher "déjà attribué ou pas" dans le catalogue (indépendamment du pop-up choisi dans l'onglet
 * Boîtes) et à agréger, pour l'onglet Local, quels pop-ups ont actuellement ce pin "à commander". */
export async function fetchAttributionsPins(): Promise<AttributionPin[]> {
  const { data, error } = await supabase
    .from('pop_up_pin_boites')
    .select('pin_id, pop_up_id, case_position, a_commander');
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

/**
 * Pesée du stock local : on pèse ce qu'il reste d'un pin après avoir servi une ou plusieurs
 * commandes pop-up, et la quantité est recalculée à partir du poids d'un lot de référence de 10
 * (`poids_unitaire`) plutôt que saisie à la main. `popUpId` est celui du pop-up "local"
 * (`pop_ups.est_local`) — pas null — pour que la policy RLS existante sur `stock_mouvements`
 * (admin OU personne attribuée à ce pop-up) laisse un non-admin du local peser sans nouvelle
 * migration ; ça sert aussi de traçabilité cohérente avec le reste du stock (chaque mouvement
 * rattaché à un lieu). `quantite_delta` volontairement laissé à null (comme l'ancien système de
 * pesée par boîte) : l'historique affiche alors `quantite_calculee` plutôt qu'un delta, cf.
 * PanneauPin.
 */
export async function peserStockGeneral(params: {
  pinId: string;
  popUpLocalId: string;
  poidsPese: number;
  profileId: string;
}): Promise<number> {
  const { pinId, popUpLocalId, poidsPese, profileId } = params;
  const pin = await fetchPin(pinId);
  if (!pin.poids_unitaire || pin.poids_unitaire <= 0) {
    throw new Error('Poids (g/10) manquant pour ce pin — renseigne-le dans le Catalogue avant de peser.');
  }

  const quantiteCalculee = Math.max(0, Math.round((poidsPese / pin.poids_unitaire) * 10));

  const { error: errorMaj } = await supabase
    .from('stock_pins')
    .update({ stock_general: quantiteCalculee, updated_at: new Date().toISOString() })
    .eq('id', pinId);
  if (errorMaj) throw errorMaj;

  const { error: errorMouvement } = await supabase.from('stock_mouvements').insert({
    pin_id: pinId,
    pop_up_id: popUpLocalId,
    type: 'pesee' as TypeMouvementStock,
    poids_pese: poidsPese,
    quantite_calculee: quantiteCalculee,
    profile_id: profileId,
  });
  if (errorMouvement) throw errorMouvement;

  return quantiteCalculee;
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

/** Signale un pin trouvé physiquement mais absent du catalogue : juste une photo (+ note libre),
 * nom provisoire — reste marqué `a_completer` jusqu'à ce qu'un admin renseigne son vrai nom, seuil
 * et poids depuis la fiche détail (qui affiche alors un bandeau "à compléter"). */
export async function signalerPinInconnu(params: { photoUrl: string; note?: string }): Promise<StockPin> {
  const { data, error } = await supabase
    .from('stock_pins')
    .insert({
      nom: 'Pin à identifier',
      photo_url: params.photoUrl,
      description: params.note?.trim() || null,
      a_completer: true,
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

