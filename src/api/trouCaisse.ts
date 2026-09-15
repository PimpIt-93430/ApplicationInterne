import { supabase } from './supabaseClient';

export interface PersonneJour {
  id: string;
  nomComplet: string;
}

export interface PersonnelJour {
  personnesPresentes: PersonneJour[];
  fermetureSuggereeId: string | null;
}

/** Personnel d'un pop-up à une date donnée, déduit de planning_shifts — même logique que le Hub
 * (app/(hub)/trou/actions.ts chargerPersonnelJour) : la personne suggérée pour la fermeture est
 * celle dont le créneau finit le plus tard ce jour-là. Purement une suggestion pré-remplie,
 * modifiable avant d'enregistrer. */
export async function fetchPersonnelJour(popUpId: string, date: string): Promise<PersonnelJour> {
  const { data, error } = await supabase
    .from('planning_shifts')
    .select('profile_id, heure_fin, profiles!planning_shifts_profile_id_fkey(nom_complet, email)')
    .eq('pop_up_id', popUpId)
    .eq('date', date);
  if (error) throw error;

  type Ligne = { profile_id: string; heure_fin: string; profiles: { nom_complet: string | null; email: string } | null };
  const lignes = (data ?? []) as unknown as Ligne[];

  const parProfil = new Map<string, { nom: string; heureFinMax: string }>();
  for (const l of lignes) {
    const nom = l.profiles?.nom_complet || l.profiles?.email || 'Sans nom';
    const existant = parProfil.get(l.profile_id);
    if (!existant || l.heure_fin > existant.heureFinMax) {
      parProfil.set(l.profile_id, { nom, heureFinMax: l.heure_fin });
    }
  }

  const personnesPresentes = Array.from(parProfil.entries())
    .map(([id, v]) => ({ id, nomComplet: v.nom }))
    .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));

  let fermetureSuggereeId: string | null = null;
  let heureFinMax = '';
  for (const [id, v] of parProfil) {
    if (v.heureFinMax > heureFinMax) {
      heureFinMax = v.heureFinMax;
      fermetureSuggereeId = id;
    }
  }

  return { personnesPresentes, fermetureSuggereeId };
}

export interface TrouCaisse {
  id: string;
  popUpId: string;
  popUpNom: string;
  date: string;
  montant: number;
  montantCompte: number | null;
  montantAttendu: number | null;
  personneFermetureId: string | null;
  personneFermetureNom: string | null;
  personnesPresentes: PersonneJour[];
  note: string | null;
  creeParNom: string;
  creeLe: string;
}

/** Historique complet, tous pop-up confondus — partagé avec le Hub (même table trous_caisse) :
 * un trou saisi ici apparaît côté Hub et inversement. */
export async function fetchTrousCaisse(): Promise<TrouCaisse[]> {
  const { data, error } = await supabase
    .from('trous_caisse')
    .select(
      'id, pop_up_id, date, montant, montant_compte, montant_attendu, personne_fermeture_id, personnes_presentes_ids, note, created_at, pop_ups(nom), fermeture:personne_fermeture_id(nom_complet, email), createur:created_by(nom_complet, email)',
    )
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: profils } = await supabase.from('profiles').select('id, nom_complet, email');
  const nomParProfil = new Map((profils ?? []).map((p) => [p.id, p.nom_complet || p.email]));

  type Ligne = {
    id: string;
    pop_up_id: string;
    date: string;
    montant: number;
    montant_compte: number | null;
    montant_attendu: number | null;
    personne_fermeture_id: string | null;
    personnes_presentes_ids: string[];
    note: string | null;
    created_at: string;
    pop_ups: { nom: string } | null;
    fermeture: { nom_complet: string | null; email: string } | null;
    createur: { nom_complet: string | null; email: string } | null;
  };

  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: l.id,
    popUpId: l.pop_up_id,
    popUpNom: l.pop_ups?.nom ?? '—',
    date: l.date,
    montant: Number(l.montant),
    montantCompte: l.montant_compte === null ? null : Number(l.montant_compte),
    montantAttendu: l.montant_attendu === null ? null : Number(l.montant_attendu),
    personneFermetureId: l.personne_fermeture_id,
    personneFermetureNom: l.fermeture ? l.fermeture.nom_complet || l.fermeture.email : null,
    personnesPresentes: l.personnes_presentes_ids.map((id) => ({ id, nomComplet: nomParProfil.get(id) ?? 'Inconnu' })),
    note: l.note,
    creeParNom: l.createur ? l.createur.nom_complet || l.createur.email : '—',
    creeLe: l.created_at,
  }));
}

export async function creerTrouCaisse(params: {
  popUpId: string;
  date: string;
  montantCompte: number;
  montantAttendu: number;
  personneFermetureId: string | null;
  personnesPresentesIds: string[];
  note: string;
  profileId: string;
}): Promise<void> {
  const { error } = await supabase.from('trous_caisse').insert({
    pop_up_id: params.popUpId,
    date: params.date,
    montant: params.montantCompte - params.montantAttendu,
    montant_compte: params.montantCompte,
    montant_attendu: params.montantAttendu,
    personne_fermeture_id: params.personneFermetureId,
    personnes_presentes_ids: params.personnesPresentesIds,
    note: params.note.trim() || null,
    created_by: params.profileId,
  });
  if (error) throw error;
}

export async function supprimerTrouCaisse(id: string): Promise<void> {
  // Une suppression bloquée par une policy RLS ne renvoie jamais d'erreur (0 ligne affectée,
  // réponse "succès" quand même) — .select() vérifie ce qui a vraiment été supprimé.
  const { data, error } = await supabase.from('trous_caisse').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Suppression bloquée (droits insuffisants ?)');
}

/** Cases (pop-up, jour) délibérément ignorées — cf. retour utilisateur du 2026-09-15 : "si le 11
 * Val d'Europe je ne veux pas remplir, j'ai la possibilité de supprimer la case" — pour qu'elles ne
 * réapparaissent jamais dans la liste d'attente, sans créer de faux trou de caisse. */
export interface TrouCaisseIgnore {
  popUpId: string;
  date: string;
}

export async function fetchTrousCaisseIgnores(): Promise<TrouCaisseIgnore[]> {
  const { data, error } = await supabase.from('trous_caisse_ignores').select('pop_up_id, date');
  if (error) throw error;
  return (data ?? []).map((l) => ({ popUpId: l.pop_up_id, date: l.date }));
}

export async function ignorerTrouCaisse(popUpId: string, date: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('trous_caisse_ignores')
    .insert({ pop_up_id: popUpId, date, ignore_par: profileId });
  if (error) throw error;
}
