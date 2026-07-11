export type Role = 'admin' | 'employe';
export type TypeContrat = 'manager' | 'employe' | 'alternant';
export type StatutShift = 'brouillon' | 'valide' | 'publie';
export type TypeConge = 'conge' | 'indisponibilite';

export interface Profile {
  id: string;
  nom_complet: string;
  email: string;
  role: Role;
  type_contrat: TypeContrat;
  pop_up_id: string | null;
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
}

export interface RegleHoraireOuverture {
  id: string;
  pop_up_id: string;
  jour_semaine: number;
  heure_ouverture: string;
  heure_fermeture: string;
  actif: boolean;
}

/** Horaire de travail par défaut d'une personne pour un jour de la semaine donné, à son
 * pop-up assigné (profile.pop_up_id) : c'est ce que la génération automatique du planning
 * utilise pour créer ses créneaux, sauf indisponibilité (table conges) ce jour-là. */
export interface HoraireRecurrentProfil {
  id: string;
  profile_id: string;
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

export type TypeMouvementStock = 'reception' | 'ajustement' | 'pesee' | 'estimation';

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
  prix_revente_ht: number | null;
  actif: boolean;
  airtable_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PopUpPinBoite {
  id: string;
  pop_up_id: string;
  pin_id: string;
  case_position: string;
  poids_pese: number | null;
  quantite_restante: number | null;
  pourcentage_restant: number | null;
  maj_par: string | null;
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
