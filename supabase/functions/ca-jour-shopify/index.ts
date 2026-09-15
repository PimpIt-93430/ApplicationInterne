// CA du jour Shopify (web) / TikTok Shop, pour la nouvelle vue "CA du jour" des admins (app
// mobile/web) — cf. retour utilisateur du 2026-09-15 : "une vue avec le CA global de la journée,
// le CA par pop up et sur le site". Réplique ventesShopifyDepuis (Pimp It Hub, lib/shopify.ts,
// même correctif fuseau horaire que lib/dateFrance.ts — cf. incident du 2026-09-15 : "aujourd'hui"
// calculé avec setHours(0,0,0,0) démarre 1-2h trop tard si le serveur tourne en UTC) — dupliqué ici
// plutôt qu'importé : cette fonction Deno n'a pas accès au code du Hub Next.js (projet séparé).
// Identifiants Shopify lus depuis Vault (mêmes secrets que verifier-commandes-shopify), pas
// Deno.env.get() — jamais exposés au client mobile, qui n'appelle que cette fonction.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const enTetesCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reponseJson(corps: unknown, status: number) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...enTetesCors, 'Content-Type': 'application/json' },
  });
}

const API_VERSION = '2024-01';
const FUSEAU = 'Europe/Paris';

/** Minuit à Paris aujourd'hui, comme véritable instant UTC — cf. lib/dateFrance.ts (Pimp It Hub)
 * pour l'explication complète du bug corrigé ici. */
function debutJourFrance(): Date {
  const maintenant = new Date();
  const fmtDate = new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(fmtDate.formatToParts(maintenant).map((p) => [p.type, p.value]));
  const fmtOffset = new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU, timeZoneName: 'shortOffset' });
  const offsetPart = fmtOffset.formatToParts(maintenant).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const heuresOffset = parseInt(offsetPart.replace('GMT', ''), 10) || 0;
  const decalage = `${heuresOffset >= 0 ? '+' : '-'}${String(Math.abs(heuresOffset)).padStart(2, '0')}:00`;
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000${decalage}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: enTetesCors });
  }
  if (req.method !== 'POST') {
    return reponseJson({ error: 'Méthode non autorisée' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return reponseJson({ error: 'Non authentifié' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const clientAppelant = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: erreurUser,
  } = await clientAppelant.auth.getUser();
  if (erreurUser || !user) {
    return reponseJson({ error: 'Non authentifié' }, 401);
  }

  const clientAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: profil } = await clientAdmin.from('profiles').select('role').eq('id', user.id).single();
  if (profil?.role !== 'admin') {
    return reponseJson({ error: 'Réservé aux administrateurs' }, 403);
  }

  const secret = async (nom: string): Promise<string> => {
    const { data } = await clientAdmin.rpc('get_vault_secret', { p_nom: nom });
    if (!data) throw new Error(`Secret Vault manquant : ${nom}`);
    return data as string;
  };

  try {
    const shopifyStore = await secret('shopify_store');
    const [shopifyClientId, shopifyClientSecret] = await Promise.all([secret('shopify_client_id'), secret('shopify_client_secret')]);
    const repAuth = await fetch(`https://${shopifyStore}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: shopifyClientId, client_secret: shopifyClientSecret }),
    });
    if (!repAuth.ok) throw new Error(`Auth Shopify ${repAuth.status} : ${await repAuth.text()}`);
    const shopifyToken = (await repAuth.json()).access_token;

    const debutJour = debutJourFrance();
    let shopify = 0;
    let tiktok = 0;
    let url: string | null =
      `https://${shopifyStore}/admin/api/${API_VERSION}/orders.json?status=any&financial_status=paid&created_at_min=${encodeURIComponent(debutJour.toISOString())}&fields=source_name,total_price&limit=250`;
    while (url) {
      const res: Response = await fetch(url, { headers: { 'X-Shopify-Access-Token': shopifyToken } });
      if (!res.ok) throw new Error(`Shopify API ${res.status} : ${await res.text()}`);
      const data = await res.json();
      for (const o of data.orders ?? []) {
        const montant = Number(o.total_price) || 0;
        if (o.source_name === 'tiktok') tiktok += montant;
        else shopify += montant;
      }
      const link = res.headers.get('link') ?? '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }

    return reponseJson({ shopify, tiktok }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('ca-jour-shopify échoué :', message);
    return reponseJson({ error: message }, 502);
  }
});
