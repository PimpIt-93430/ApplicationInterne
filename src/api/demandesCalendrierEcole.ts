import { supabase } from './supabaseClient';
import type {
  ActionJourCalendrierEcole,
  DemandeCalendrierEcole,
  JourCalendrierEcoleDemande,
} from '@/types/database.types';

export interface DemandeAvecJours {
  demande: DemandeCalendrierEcole;
  jours: JourCalendrierEcoleDemande[];
}

function separer(
  ligne: DemandeCalendrierEcole & { jours: JourCalendrierEcoleDemande[] },
): DemandeAvecJours {
  const { jours, ...demande } = ligne;
  return { demande, jours };
}

/** Demande en attente de cet alternant, s'il y en a une (une seule possible à la fois, cf.
 * contrainte unique migration 0052) — sert à verrouiller l'écran tant que l'admin n'a pas répondu. */
export async function fetchDemandeCalendrierEcoleEnAttente(profileId: string): Promise<DemandeAvecJours | null> {
  const { data, error } = await supabase
    .from('demandes_calendrier_ecole')
    .select('*, jours:demandes_calendrier_ecole_jours(*)')
    .eq('profile_id', profileId)
    .eq('statut', 'en_attente')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return separer(data as unknown as DemandeCalendrierEcole & { jours: JourCalendrierEcoleDemande[] });
}

/** Toutes les demandes en attente, tous alternants confondus — écran de validation admin. */
export async function fetchDemandesCalendrierEcoleEnAttente(): Promise<DemandeAvecJours[]> {
  const { data, error } = await supabase
    .from('demandes_calendrier_ecole')
    .select('*, jours:demandes_calendrier_ecole_jours(*)')
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as (DemandeCalendrierEcole & { jours: JourCalendrierEcoleDemande[] })[]).map(separer);
}

/** Envoie le brouillon accumulé (potentiellement sur plusieurs mois) comme une seule demande. */
export async function envoyerDemandeCalendrierEcole(params: {
  profileId: string;
  diffs: { date: string; action: ActionJourCalendrierEcole }[];
}): Promise<string> {
  const { data: demande, error: errorDemande } = await supabase
    .from('demandes_calendrier_ecole')
    .insert({ profile_id: params.profileId })
    .select('id')
    .single();
  if (errorDemande) throw errorDemande;

  const { error: errorJours } = await supabase
    .from('demandes_calendrier_ecole_jours')
    .insert(params.diffs.map((d) => ({ demande_id: demande.id, date: d.date, action: d.action })));
  if (errorJours) throw errorJours;

  return demande.id;
}

/** Valide/refuse une demande — n'applique PAS les jours à `jours_ecole_alternant` (cf.
 * useTraiterDemandeCalendrierEcole, qui le fait côté client avant d'appeler cette fonction). */
export async function traiterDemandeCalendrierEcole(params: {
  id: string;
  statut: 'validee' | 'refusee';
  traitePar: string;
}) {
  const { error } = await supabase
    .from('demandes_calendrier_ecole')
    .update({ statut: params.statut, traite_par: params.traitePar, traite_le: new Date().toISOString() })
    .eq('id', params.id);
  if (error) throw error;
}
