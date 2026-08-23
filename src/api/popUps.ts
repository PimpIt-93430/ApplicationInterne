import { supabase } from './supabaseClient';
import type { PopUp } from '@/types/database.types';

const PALETTE_COULEURS = ['#6366F1', '#F97316', '#10B981', '#EC4899', '#0EA5E9', '#EAB308'];

export async function fetchPopUps(): Promise<PopUp[]> {
  const { data, error } = await supabase
    .from('pop_ups')
    .select('*')
    .eq('actif', true)
    .order('nom', { ascending: true });
  if (error) throw error;
  return data;
}

export async function creerPopUp(params: {
  nom: string;
  heureOuverture: string;
  heureFermeture: string;
  dateDebut?: string | null;
  dateFin?: string | null;
}): Promise<PopUp> {
  const { data: existants, error: errorCompte } = await supabase.from('pop_ups').select('id');
  if (errorCompte) throw errorCompte;
  const couleur = PALETTE_COULEURS[(existants?.length ?? 0) % PALETTE_COULEURS.length];

  const { data: popUp, error: errorPopUp } = await supabase
    .from('pop_ups')
    .insert({ nom: params.nom, couleur, date_debut: params.dateDebut ?? null, date_fin: params.dateFin ?? null })
    .select()
    .single();
  if (errorPopUp) throw errorPopUp;

  const heureOuverture = `${params.heureOuverture}:00`;
  const heureFermeture = `${params.heureFermeture}:00`;
  const horaires = Array.from({ length: 7 }, (_, jour_semaine) => ({
    pop_up_id: popUp.id,
    jour_semaine,
    heure_ouverture: heureOuverture,
    heure_fermeture: heureFermeture,
    actif: true,
  }));
  const { error: errorHoraires } = await supabase.from('regles_horaires_ouverture').insert(horaires);
  if (errorHoraires) throw errorHoraires;

  return popUp;
}

export async function renommerPopUp(id: string, nom: string) {
  const { error } = await supabase.from('pop_ups').update({ nom }).eq('id', id);
  if (error) throw error;
}

export async function modifierDatesPopUp(id: string, dateDebut: string | null, dateFin: string | null) {
  const { error } = await supabase.from('pop_ups').update({ date_debut: dateDebut, date_fin: dateFin }).eq('id', id);
  if (error) throw error;
}

/** Coordonnées GPS saisies à la main (ex. copiées depuis Google Maps) — servent à retrouver quel
 * pop-up a fait une vente SumUp par proximité (cf. écran Finance). */
export async function modifierCoordonneesPopUp(id: string, lat: number | null, lon: number | null) {
  const { error } = await supabase.from('pop_ups').update({ lat, lon }).eq('id', id);
  if (error) throw error;
}

/** Créneaux matin/après-midi prédéfinis pour ce lieu (cf. HoraireRecurrentJourCard, boutons
 * Matin/Après-midi) — indépendants du jour de la semaine, contrairement aux horaires d'ouverture. */
export async function modifierCreneauxPredefinisPopUp(
  id: string,
  creneaux: {
    matinDebut: string | null;
    matinFin: string | null;
    matinPauseDebut: string | null;
    matinPauseFin: string | null;
    apresMidiDebut: string | null;
    apresMidiFin: string | null;
    apresMidiPauseDebut: string | null;
    apresMidiPauseFin: string | null;
  },
) {
  const { error } = await supabase
    .from('pop_ups')
    .update({
      matin_debut: creneaux.matinDebut,
      matin_fin: creneaux.matinFin,
      matin_pause_debut: creneaux.matinPauseDebut,
      matin_pause_fin: creneaux.matinPauseFin,
      apres_midi_debut: creneaux.apresMidiDebut,
      apres_midi_fin: creneaux.apresMidiFin,
      apres_midi_pause_debut: creneaux.apresMidiPauseDebut,
      apres_midi_pause_fin: creneaux.apresMidiPauseFin,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function supprimerPopUp(id: string) {
  const { error } = await supabase.from('pop_ups').delete().eq('id', id);
  if (error) throw error;
}
