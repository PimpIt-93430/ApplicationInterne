import { supabase } from './supabaseClient';

export interface CaJourShopify {
  shopify: number;
  tiktok: number;
}

/** CA du jour Shopify (web) / TikTok Shop — passe par la fonction Edge ca-jour-shopify, seule à
 * détenir les identifiants Shopify (jamais exposés côté app), cf. écran "CA du jour" (retour
 * utilisateur du 2026-09-15). Réservé aux admins (vérifié aussi côté fonction). */
export async function fetchCaJourShopify(): Promise<CaJourShopify> {
  const { data, error } = await supabase.functions.invoke('ca-jour-shopify', { method: 'POST' });
  if (error) throw error;
  return data as CaJourShopify;
}
