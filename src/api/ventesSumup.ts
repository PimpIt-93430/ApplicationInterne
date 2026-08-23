import { supabase } from './supabaseClient';
import type { VenteSumup, VenteSumupLigne } from '@/types/database.types';

export async function fetchVentesSumupPeriode(dateDebut: string, dateFin: string): Promise<VenteSumup[]> {
  const { data, error } = await supabase
    .from('ventes_sumup')
    .select('*')
    .gte('horodatage', dateDebut)
    .lte('horodatage', dateFin)
    .order('horodatage', { ascending: false });
  if (error) throw error;
  return data;
}

/** Lignes produit des ventes de la période (écran Finance > Historique) — horodatage dénormalisé
 * sur la ligne (cf. migration 0068) donc filtrable directement, pas besoin de passer par une
 * jointure sur ventes_sumup. */
export async function fetchVentesSumupLignesPeriode(dateDebut: string, dateFin: string): Promise<VenteSumupLigne[]> {
  const { data, error } = await supabase
    .from('ventes_sumup_lignes')
    .select('*')
    .gte('horodatage', dateDebut)
    .lte('horodatage', dateFin);
  if (error) throw error;
  return data;
}

/** Déclenche l'Edge Function `sync-ventes-sumup` (admin uniquement côté serveur) — récupère les
 * nouvelles ventes SumUp et réattribue pop-up/salarié sur toutes les ventes connues. Sans
 * paramètres, synchronise la fenêtre par défaut (45 derniers jours, cf. Edge Function). */
export async function synchroniserVentesSumup(params?: {
  depuis?: string;
  jusqua?: string;
}): Promise<{
  transactions_vues: number;
  nouvelles_ou_modifiees: number;
  reattributions: number;
  plafond_details_atteint: boolean;
}> {
  const { data, error } = await supabase.functions.invoke('sync-ventes-sumup', { body: params ?? {} });
  if (error) {
    // supabase-js ne lit pas le corps de la réponse pour nous sur une erreur HTTP (juste "Edge
    // Function returned a non-2xx status code") — on va chercher le vrai message qu'on renvoie
    // nous-mêmes (cf. reponseJson côté fonction) dans error.context, le Response brut.
    let message = error.message;
    const contexte = (error as { context?: unknown }).context;
    if (contexte instanceof Response) {
      try {
        const corps = await contexte.clone().json();
        if (corps?.error) message = corps.error;
      } catch {
        // Corps non-JSON (ex. timeout réseau) : on garde le message générique.
      }
    }
    throw new Error(message);
  }
  return data;
}
