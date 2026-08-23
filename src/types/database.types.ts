export type Role = 'admin' | 'employe';
export type TypeContrat = 'manager' | 'employe' | 'alternant';
export type StatutShift = 'brouillon' | 'valide' | 'publie';
export type TypeConge = 'conge' | 'indisponibilite' | 'absence' | 'repos';
export type StatutConge = 'en_attente' | 'validee' | 'refusee';
// Finance reste strictement réservé aux admins (décision explicite, migration 0035) : pas de droit
// pour ça, uniquement "calendrier" peut être accordé à un non-admin.
export type Fonctionnalite = 'calendrier' | 'equipe';
export type StatutVenteEspece = 'confirmee' | 'annulee';

export interface Profile {
  id: string;
  nom_complet: string;
  email: string;
  role: Role;
  type_contrat: TypeContrat;
  couleur: string;
  heures_max_semaine: number | null;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

export interface PopUp {
  id: string;
  nom: string;
  couleur: string;
  actif: boolean;
  est_local: boolean;
  /** Date d'ouverture / fermeture prévue — nullable (inconnue, ou non pertinent pour le local). */
  date_debut: string | null;
  date_fin: string | null;
  /** Coordonnées GPS du pop-up, saisies à la main — sert à retrouver quel lieu a fait une vente
   * SumUp par proximité (cf. src/api/ventesSumup.ts), aucun autre champ fiable pour ça. */
  lat: number | null;
  lon: number | null;
  /** Créneaux matin/après-midi prédéfinis pour ce lieu (indépendants du jour de la semaine,
   * contrairement à regles_horaires_ouverture) — nullable tant que l'admin ne les a pas réglés. */
  matin_debut: string | null;
  matin_fin: string | null;
  apres_midi_debut: string | null;
  apres_midi_fin: string | null;
  /** Pause optionnelle sur chacun des deux créneaux prédéfinis — les deux nulles ensemble si pas
   * de pause pour ce créneau. */
  matin_pause_debut: string | null;
  matin_pause_fin: string | null;
  apres_midi_pause_debut: string | null;
  apres_midi_pause_fin: string | null;
}

/** Attribution d'une personne à un lieu où elle peut être planifiée. Une personne peut être
 * attribuée à plusieurs lieux. Les admins n'ont pas besoin d'y figurer : ils sont considérés
 * attribués à tous les lieux (vérifié via profile.role === 'admin'). */
export interface ProfilPopUp {
  id: string;
  profile_id: string;
  pop_up_id: string;
  created_at: string;
}

/** Accès élargi accordé à un employé non-admin sur Calendrier (responsable d'un pop-up),
 * éventuellement limité à un seul pop-up (`pop_up_id: null` = tous les pop-ups) — cf.
 * `a_droit`/`a_droit_sur_profil` en RLS (migration 0034). Le Stock n'a pas de droit dédié : il
 * continue de suivre `ProfilPopUp`. Finance reste strictement réservé aux admins (migration 0035,
 * décision explicite — pas de droit possible pour ça). */
export interface DroitEmploye {
  id: string;
  profile_id: string;
  fonctionnalite: Fonctionnalite;
  pop_up_id: string | null;
  created_at: string;
}

/** Encaissement en espèces déclaré manuellement par un manager (écran "Ventes"), distinct des
 * ventes carte SumUp synchronisées automatiquement (cf. VenteSumup). Jamais supprimée : une vente
 * annulée reste visible avec `annule_par`/`annule_le` renseignés (cf. migration 0048). */
export interface VenteEspece {
  id: string;
  pop_up_id: string;
  profile_id: string;
  montant: number;
  statut: StatutVenteEspece;
  annule_par: string | null;
  annule_le: string | null;
  created_at: string;
}

export interface RegleHoraireOuverture {
  id: string;
  pop_up_id: string;
  jour_semaine: number;
  heure_ouverture: string;
  heure_fermeture: string;
  actif: boolean;
}

/** Horaire de travail par défaut d'une personne pour un jour de la semaine donné, à l'un de ses
 * lieux attribués (profil_pop_ups) : c'est ce que la génération automatique du planning utilise
 * pour créer ses créneaux, sauf indisponibilité (table conges) ce jour-là. */
export interface HoraireRecurrentProfil {
  id: string;
  profile_id: string;
  pop_up_id: string;
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
  actif: boolean;
  updated_at: string;
  /** Pause déjeuner optionnelle (même principe que PlanningShift.pause_debut/pause_fin) — les
   * deux nulles ensemble si pas de pause. Optionnelles pour ne pas casser les upserts existants. */
  pause_debut?: string | null;
  pause_fin?: string | null;
  /** 'toutes' : cet horaire s'applique chaque semaine. 'premiere'/'deuxieme' : un jour sur deux,
   * seulement la semaine correspondante — la parité est calée sur la semaine d'ouverture du
   * pop-up (pop_ups.date_debut), cf. semaineCorrespondPourFrequence dans generationPlanning.ts.
   * Fait partie de la clé d'unicité avec profile_id/jour_semaine (migration 0063) : une même
   * personne peut donc avoir un horaire 'premiere' ET un 'deuxieme' différents pour le même jour
   * de semaine (heures distinctes d'une semaine à l'autre). */
  semaine_reference: 'toutes' | 'premiere' | 'deuxieme';
}

export interface PlanningShift {
  id: string;
  pop_up_id: string;
  profile_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  statut: StatutShift;
  genere_automatiquement: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Étiquette libre affichée sur le bloc (ex. "Ouverture", "Fermeture"...), liste fixe côté
   * client (cf. ETIQUETTES_SHIFT dans PanneauCreationShift.tsx). Nullable = pas d'étiquette.
   * Optionnelle (et non juste nullable) pour que les inserts existants qui ne la renseignent pas
   * (génération auto du planning, cf. domain/generationPlanning.ts) restent valides tels quels. */
  etiquette?: string | null;
  /** Pause déjeuner optionnelle (ex. 13h-14h sur un shift 10h-18h) — les deux nulles ensemble si
   * pas de pause. Optionnelles pour ne pas casser les inserts existants qui ne les renseignent pas. */
  pause_debut?: string | null;
  pause_fin?: string | null;
}

export interface Conge {
  id: string;
  profile_id: string;
  date_debut: string;
  date_fin: string;
  heure_debut: string | null;
  heure_fin: string | null;
  type: TypeConge;
  note: string | null;
  statut: StatutConge;
  traite_par: string | null;
  traite_le: string | null;
  created_at: string;
}

export interface JourEcoleAlternant {
  id: string;
  profile_id: string;
  date: string;
  note: string | null;
  created_at: string;
}

export type StatutDemande = 'en_attente' | 'validee' | 'refusee';
export type ActionJourCalendrierEcole = 'ajout' | 'suppression';

/** Demande groupée de modification du calendrier école (plusieurs mois à la fois) — un alternant
 * ne peut plus toucher directement à `jours_ecole_alternant` (migration 0052), il propose des
 * changements que seul l'admin applique en validant. */
export interface DemandeCalendrierEcole {
  id: string;
  profile_id: string;
  statut: StatutDemande;
  traite_par: string | null;
  traite_le: string | null;
  created_at: string;
}

export interface JourCalendrierEcoleDemande {
  id: string;
  demande_id: string;
  date: string;
  action: ActionJourCalendrierEcole;
}

export interface Notification {
  id: string;
  profile_id: string;
  titre: string;
  corps: string;
  lu: boolean;
  created_at: string;
}

/** Informations RH sensibles d'un collaborateur (écran Équipe, web uniquement) — séparées de
 * `Profile` car ce dernier est lisible par tout utilisateur connecté (cf. policy
 * "profils_lecture") : ces champs ne doivent être visibles que par l'admin et la personne
 * concernée (cf. policies "informations_rh_*" dans la migration 0030). */
export interface InformationsRh {
  profile_id: string;

  genre: string | null;
  nationalite: string | null;
  date_naissance: string | null;
  pays_naissance: string | null;
  departement_naissance: string | null;
  commune_naissance: string | null;
  situation_familiale: string | null;
  nombre_personnes_charge: number | null;

  tel_mobile: string | null;
  tel_fixe: string | null;
  notifications_sms: boolean;
  adresse: string | null;
  complement_adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;

  contact_urgence_prenom: string | null;
  contact_urgence_nom: string | null;
  contact_urgence_lien: string | null;
  contact_urgence_tel_mobile: string | null;
  contact_urgence_tel_fixe: string | null;

  nom_titulaire_compte: string | null;
  iban: string | null;
  bic: string | null;

  numero_secu: string | null;
  handicap: boolean;
  type_handicap: string | null;
  date_derniere_visite_medicale: string | null;
  visite_medicale_renforcee: boolean;
  prochaine_visite_medicale: string | null;

  matricule: string | null;
  date_debut_contrat: string | null;
  heure_debut_contrat: string | null;
  responsable_hierarchique_id: string | null;
  etablissement_par_defaut_id: string | null;

  travailleur_etranger: boolean;
  autorisation_travail: string | null;

  /** Coché = les heures du dimanche de cette personne sont exclues du total RH (Demande & RH),
   * car payées sur un contrat séparé. Décoché par défaut : le dimanche compte normalement comme
   * n'importe quel autre jour. */
  exclure_heures_dimanche: boolean;

  /** Email utilisé par ce salarié pour se connecter à SumUp — sert à rattacher ses ventes (champ
   * `user` d'une transaction SumUp). Ici et pas sur `profiles` : ce dernier est lisible/modifiable
   * par tout employé connecté, ce qui en ferait un champ non fiable pour l'attribution financière. */
  sumup_email: string | null;

  updated_at: string;
}

export interface DocumentEmploye {
  id: string;
  profile_id: string;
  nom_fichier: string;
  chemin_stockage: string;
  uploaded_by: string;
  created_at: string;
}

export type TypeMouvementStock = 'reception' | 'ajustement' | 'pesee' | 'estimation';

export type TaillePin = 'petit' | 'moyen' | 'gros';

export type EmplacementType = 'boite_rouge' | 'bac_gris';

export interface StockPin {
  id: string;
  nom: string;
  sku_pimpit: string | null;
  sku_fournisseur: string | null;
  fournisseur: string | null;
  photo_url: string | null;
  description: string | null;
  poids_unitaire: number | null;
  poids_total: number | null;
  stock_general: number;
  stock_a_ramener: number;
  seuil_cible: number | null;
  taille: TaillePin | null;
  /** Emplacement physique dans l'entrepot (plan de rangement calcule depuis l'historique de
   * commandes) : "boite_rouge" (emplacement_numero = 1-72) ou "bac_gris" (emplacement_rangement
   * = 1-6, emplacement_numero = 1-36). Null si le pin n'a pas encore d'emplacement attribue. */
  emplacement_type: EmplacementType | null;
  emplacement_rangement: number | null;
  emplacement_numero: number | null;
  prix_revente_ht: number | null;
  a_completer: boolean;
  actif: boolean;
  airtable_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CouleurChaussure = 'Noir' | 'Kaki' | 'Rose' | 'Gris';
export type TailleChaussure = '36-37' | '38-39' | '40-41' | '41-42' | '43-44' | '45-46';

export interface ChaussureStock {
  id: string;
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  /** Niveau de stock visé — "à ramener" ne se stocke plus nulle part, il se calcule (stock_initial
   * moins le dernier inventaire compté, cf. calculerAramener dans src/api/chaussures.ts). */
  stock_initial: number;
  updated_at: string;
}

/** Un comptage réel par le pop-up, couleur/taille par couleur/taille — jamais écrasé (contrairement
 * à l'ancien système "à ramener"), donc garde tout l'historique des inventaires passés. Propre à
 * chaque pop-up (contrairement à ChaussureStock.stock_initial, qui reste unique et partagé). */
export interface ChaussureInventaire {
  id: string;
  pop_up_id: string;
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  quantite_comptee: number;
  profile_id: string;
  created_at: string;
}

/** Une ligne produit d'une transaction SumUp (cf. sync-ventes-sumup) — pop_up_id/horodatage
 * dénormalisés depuis ventes_sumup pour que ces lignes restent lisibles par le pop-up concerné
 * sans passer par la table financière (réservée aux admins, cf. ventes_sumup). */
export interface VenteSumupLigne {
  id: string;
  vente_id: string;
  pop_up_id: string | null;
  horodatage: string;
  nom_produit: string;
  /** Porte parfois la variante choisie à la vente, ex. "43-44 · Noir" pour "Clogs" — cf.
   * resoudreVentesSumup, qui la parse en priorité avant de retomber sur chaussures_mapping_sumup.
   * Chaîne vide si SumUp n'a vraiment aucune description, null tant que non encore vérifié (cf.
   * sync-ventes-sumup, passe de réparation). */
  description: string | null;
  quantite: number;
  created_at: string;
}

/** Correspondance entre un nom de produit du catalogue SumUp et une couleur/taille chez nous —
 * gérée à la main par un admin (pas de parsing automatique du nom, plus fiable). */
export interface ChaussureMappingSumup {
  id: string;
  nom_produit: string;
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  created_at: string;
  updated_at: string;
}

/** Attribution directe d'un email SumUp à un pop-up (pas à une personne, contrairement à
 * InformationsRh.sumup_email) — consultée en priorité sur le GPS par sync-ventes-sumup. */
export interface SumupEmailPopUp {
  id: string;
  email: string;
  pop_up_id: string;
  created_at: string;
  updated_at: string;
}

export interface PopUpPinBoite {
  id: string;
  pop_up_id: string;
  pin_id: string;
  case_position: string;
  a_commander: boolean;
  poids_pese: number | null;
  quantite_restante: number | null;
  pourcentage_restant: number | null;
  maj_par: string | null;
  updated_at: string;
}

/** Trace "qui a rempli quelle boîte, quand" — indépendante des flags a_commander. */
export interface PopUpBoiteRemplissage {
  id: string;
  pop_up_id: string;
  case_position: string;
  profile_id: string;
  created_at: string;
}

/** Une ligne par pin à chaque validation de commande reçue : sert d'historique visible et de
 * base au cron hebdomadaire qui ajuste seuil_cible (voir migration 0029). */
export interface CommandeHistorique {
  id: string;
  pop_up_id: string;
  pin_id: string;
  trouve: boolean;
  profile_id: string | null;
  created_at: string;
}

export type StatutCommandePopUp = 'envoyee' | 'prete' | 'recue';

/** Cycle de vie d'une commande envoyée par un pop-up au local : envoyée (par le pop-up) → prête
 * (préparée/pesée par le local) → reçue (par le pop-up, une fois récupérée). Une seule commande
 * pas encore reçue à la fois par pop-up (contrainte en base, migration 0037). */
export interface CommandePopUp {
  id: string;
  pop_up_id: string;
  statut: StatutCommandePopUp;
  envoyee_par: string | null;
  envoyee_at: string;
  preparee_par: string | null;
  preparee_at: string | null;
  recue_par: string | null;
  recue_at: string | null;
  created_at: string;
}

/** Un pin de la commande — "fait" = le local a pesé/préparé ce pin pour cette commande. */
export interface CommandeLigne {
  id: string;
  commande_id: string;
  pin_id: string;
  fait: boolean;
  updated_at: string;
}

export type StatutCommandeConsommables = 'demandee' | 'envoyee' | 'recue';
export type TypeConsommable =
  | 'pochon'
  | 'sac_chaussures'
  | 'scotch_double_face'
  | 'enveloppes'
  | 'sac_poubelle'
  | 'autre';

/** Cycle de vie d'une commande de consommables : demandée (par le pop-up) → envoyée (par le
 * local, une fois préparée) → reçue (par le pop-up, une fois récupérée) — même principe que
 * CommandePopUp pour les pin's, sans étape de pesée/préparation détaillée (migration 0043). */
export interface CommandeConsommables {
  id: string;
  pop_up_id: string;
  statut: StatutCommandeConsommables;
  demandee_par: string | null;
  demandee_at: string;
  envoyee_par: string | null;
  envoyee_at: string | null;
  recue_par: string | null;
  recue_at: string | null;
  created_at: string;
}

export interface CommandeConsommableLigne {
  id: string;
  commande_id: string;
  type: TypeConsommable;
  description: string | null;
  created_at: string;
}

export type StatutVenteSumup = 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'REFUNDED' | 'CHARGE_BACK';

/** Vente SumUp synchronisée chez nous (cf. supabase/functions/sync-ventes-sumup) — pop_up_id et
 * profile_id sont déduits automatiquement (proximité GPS / email SumUp mappé dans
 * informations_rh.sumup_email) et peuvent rester null si non résolus (cf. écran Finance, section
 * "Ventes non attribuées"). */
export interface VenteSumup {
  id: string;
  sumup_transaction_id: string;
  pop_up_id: string | null;
  profile_id: string | null;
  montant: number;
  devise: string;
  frais_montant: number | null;
  pourboire_montant: number | null;
  statut: StatutVenteSumup;
  moyen_paiement: string | null;
  horodatage: string;
  lat: number | null;
  lon: number | null;
  distance_pop_up_metres: number | null;
  sumup_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMouvement {
  id: string;
  pin_id: string;
  pop_up_id: string | null;
  type: TypeMouvementStock;
  quantite_delta: number | null;
  poids_pese: number | null;
  quantite_calculee: number | null;
  pourcentage_restant: number | null;
  case_position: string | null;
  note: string | null;
  profile_id: string | null;
  created_at: string;
}
