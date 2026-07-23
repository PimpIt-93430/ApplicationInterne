import { supabase } from './supabaseClient';
import type { VenteSumup } from '@/types/database.types';

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
  if (error) throw error;
  return data;
}
