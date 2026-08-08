import { supabase } from './supabaseClient';
import type { Conge, StatutConge, TypeConge } from '@/types/database.types';

export async function fetchCongesProfile(profileId: string): Promise<Conge[]> {
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .eq('profile_id', profileId)
    .order('date_debut', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchCongesPeriode(dateDebut: string, dateFin: string): Promise<Conge[]> {
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .lte('date_debut', dateFin)
    .gte('date_fin', dateDebut);
  if (error) throw error;
  return data;
}

export async function ajouterConge(params: {
  profileId: string;
  dateDebut: string;
  dateFin: string;
  heureDebut: string | null;
  heureFin: string | null;
  type: TypeConge;
  note: string;
}) {
  const { error } = await supabase.from('conges').insert({
    profile_id: params.profileId,
    date_debut: params.dateDebut,
    date_fin: params.dateFin,
    heure_debut: params.heureDebut,
    heure_fin: params.heureFin,
    type: params.type,
    note: params.note,
  });
  if (error) throw error;
}

export async function supprimerConge(id: string) {
  const { error } = await supabase.from('conges').delete().eq('id', id);
  if (error) throw error;
}

/** Demande de congé soumise par l'employé lui-même — distincte de `ajouterConge` (qui sert aux
 * indisponibilités, effectives immédiatement) : celle-ci part toujours "en_attente", ne touche pas
 * au planning tant qu'un manager/admin ne l'a pas validée (écran de validation hors périmètre
 * actuel). */
export async function demanderConge(params: {
  profileId: string;
  dateDebut: string;
  dateFin: string;
  note: string;
}) {
  const { error } = await supabase.from('conges').insert({
    profile_id: params.profileId,
    date_debut: params.dateDebut,
    date_fin: params.dateFin,
    heure_debut: null,
    heure_fin: null,
    type: 'conge',
    statut: 'en_attente',
    note: params.note,
  });
  if (error) throw error;
}

/** Demandes de congé en attente visibles par la personne connectée — RLS s'occupe déjà de ne
 * renvoyer que celles de son équipe (droit "équipe"/"calendrier") ou tout si admin, cf. policies
 * "conges_lecture_equipe"/"conges_lecture" (migrations 0034/0038). Écran de validation manager. */
export async function fetchDemandesCongeEnAttente(): Promise<Conge[]> {
  const { data, error } = await supabase
    .from('conges')
    .select('*')
    .eq('type', 'conge')
    .eq('statut', 'en_attente')
    .order('date_debut', { ascending: true });
  if (error) throw error;
  return data;
}

/** Valide/refuse une demande de congé — le trigger proteger_statut_conges (migration 0041)
 * ignore silencieusement ces champs si l'appelant n'a pas le droit "calendrier"/"équipe" sur la
 * personne concernée, donc pas besoin de re-vérifier côté client. */
export async function traiterDemandeConge(params: {
  id: string;
  statut: Extract<StatutConge, 'validee' | 'refusee'>;
  traitePar: string;
}) {
  const { error } = await supabase
    .from('conges')
    .update({ statut: params.statut, traite_par: params.traitePar, traite_le: new Date().toISOString() })
    .eq('id', params.id);
  if (error) throw error;
}
