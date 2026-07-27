export type Role = 'admin' | 'employe';
export type TypeContrat = 'manager' | 'employe' | 'alternant';
export type StatutShift = 'brouillon' | 'valide' | 'publie';
export type TypeConge = 'conge' | 'indisponibilite';
export type StatutConge = 'en_attente' | 'validee' | 'refusee';
// Finance reste strictement réservé aux admins (décision explicite, migration 0035) : pas de droit
// pour ça, uniquement "calendrier" peut être accordé à un non-admin.
export type Fonctionnalite = 'calendrier' | 'equipe';

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
  quantite_a_ramener: number;
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
