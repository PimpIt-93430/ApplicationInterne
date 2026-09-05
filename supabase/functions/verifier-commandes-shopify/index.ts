// Cf. retour utilisateur du 2026-09-05 (suite à l'incident #27129 — une commande payée jamais
// entrée dans le cache Supabase du Hub, cf. lib/commandes-shopify-cache.ts) : "il faudrait une
// fonction tous les soirs qui vérifie qu'on a bien toutes les commandes [...] et remettre celles
// qui y sont pas". Filet de sécurité indépendant de la synchro incrémentale déclenchée par une
// visite de l'écran "Commandes Shopify" (celle-ci peut rater une commande si un lot échoue et que
// personne ne revisite l'écran assez tôt) : chaque nuit, re-télécharge TOUTES les commandes
// Shopify des 3 derniers jours (marge large plutôt qu'un strict "aujourd'hui", pour rattraper une
// nuit où le cron aurait échoué) et les upsert dans le cache — upsert étant idempotent, pas besoin
// de comparer d'abord ce qui manque : une commande déjà à jour est juste réécrite à l'identique.
//
// Identifiants Shopify lus depuis Vault (mêmes secrets que envoyer-suivis-sendcloud :
// shopify_store/shopify_client_id/shopify_client_secret), pas Deno.env.get() — cette fonction
// tourne séparée du Hub Next.js. Auth cron via x-cron-secret, même mécanisme que les autres jobs
// (cf. migration 0075).
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

const NB_JOURS_FENETRE = 3;
const TAILLE_LOT = 50;
const API_VERSION = '2024-01';

type StatutExpeditionCommande =
  | 'a_creer'
  | 'partielle'
  | 'expediee'
  | 'en_transit'
  | 'tentative_echouee'
  | 'livree'
  | 'perdue'
  | 'annulee'
  | 'archivee';

// Port exact de deriveStatutExpedition/mapperCommandeShopify (Pimp It Hub, lib/shopify.ts) — dupliqué
// ici plutôt qu'importé car cette fonction Deno n'a pas accès au code du Hub Next.js (projet séparé).
function deriveStatutExpedition(
  cancelledAt: string | null,
  closedAt: string | null,
  fulfillmentStatus: string | null,
  dernierFulfillment: { shipment_status?: string | null } | undefined,
): StatutExpeditionCommande {
  if (cancelledAt) return 'annulee';
  if (fulfillmentStatus === 'partial') return 'partielle';
  if (fulfillmentStatus !== 'fulfilled') return closedAt ? 'archivee' : 'a_creer';
  switch (dernierFulfillment?.shipment_status) {
    case 'delivered':
      return 'livree';
    case 'failure':
      return 'perdue';
    case 'attempted_delivery':
      return 'tentative_echouee';
    case 'in_transit':
    case 'out_for_delivery':
    case 'confirmed':
    case 'label_printed':
    case 'label_purchased':
    case 'picked_up':
    case 'ready_for_pickup':
      return 'en_transit';
    default:
      return 'expediee';
  }
}

function mapperCommandePourCache(o: Record<string, any>) {
  const fulfillments = (o.fulfillments ?? []).map((f: Record<string, any>) => ({
    trackingCompany: f.tracking_company || null,
    trackingNumber: f.tracking_number || null,
    trackingUrl: f.tracking_url || null,
    shipmentStatus: f.shipment_status || null,
    creeLe: f.created_at,
  }));
  const dernierFulfillment = (o.fulfillments ?? [])[(o.fulfillments?.length ?? 0) - 1];

  const adresseLivraison = o.shipping_address
    ? {
        prenom: o.shipping_address.first_name || null,
        nom: o.shipping_address.last_name || null,
        entreprise: o.shipping_address.company || null,
        telephone: o.shipping_address.phone || o.phone || null,
        adresse1: o.shipping_address.address1 || null,
        adresse2: o.shipping_address.address2 || null,
        ville: o.shipping_address.city || null,
        codePostal: o.shipping_address.zip || null,
        paysCode: o.shipping_address.country_code || null,
      }
    : null;

  const adresse = o.shipping_address
    ? [o.shipping_address.address1, o.shipping_address.zip, o.shipping_address.city, o.shipping_address.country]
        .filter(Boolean)
        .join(', ')
    : null;

  const nomClient =
    [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || o.shipping_address?.name || o.email || 'Client';

  return {
    shopify_id: o.id,
    nom: o.name,
    cree_le: o.created_at,
    client: nomClient,
    email: o.email ?? null,
    statut_paiement: o.financial_status ?? null,
    statut_expedition: deriveStatutExpedition(o.cancelled_at, o.closed_at, o.fulfillment_status, dernierFulfillment),
    statut_expedition_brut: dernierFulfillment?.shipment_status ?? null,
    total_prix: o.total_price ?? '0.00',
    devise: o.currency ?? 'EUR',
    adresse,
    adresse_livraison: adresseLivraison,
    moyen_expedition: o.shipping_lines?.[0]?.title ?? null,
    lignes: (o.line_items ?? []).map((li: Record<string, any>) => ({
      titre: li.title,
      variante: li.variant_title || null,
      sku: li.sku || null,
      quantite: li.quantity,
      productId: li.product_id ?? null,
    })),
    fulfillments,
    shopify_updated_at: o.updated_at,
    synced_at: new Date().toISOString(),
  };
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
  const clientAdmin = createClient(supabaseUrl, serviceRoleKey);

  const cronSecretHeader = req.headers.get('x-cron-secret');
  let estAppelSysteme = false;
  if (cronSecretHeader) {
    const { data: secretAttendu } = await clientAdmin.rpc('get_vault_secret', {
      p_nom: 'cron_verifier_commandes_shopify_secret',
    });
    estAppelSysteme = !!secretAttendu && cronSecretHeader === secretAttendu;
  }
  const declenchePar = cronSecretHeader ? 'cron' : 'app';
  const journaliser = async (ok: boolean, message: string, nbVerifiees = 0) => {
    await clientAdmin
      .from('verification_commandes_shopify_etat')
      .upsert({ id: true, derniere_execution_le: new Date().toISOString(), ok, message, declenche_par: declenchePar, nb_commandes_verifiees: nbVerifiees });
  };
  if (!estAppelSysteme) {
    const clientAppelant = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: erreurUser,
    } = await clientAppelant.auth.getUser();
    if (erreurUser || !user) {
      await journaliser(false, 'Authentification échouée (secret cron absent/invalide ou session app expirée)');
      return reponseJson({ error: 'Non authentifié' }, 401);
    }
  }

  const secret = async (nom: string): Promise<string> => {
    const { data } = await clientAdmin.rpc('get_vault_secret', { p_nom: nom });
    if (!data) throw new Error(`Secret Vault manquant : ${nom}`);
    return data as string;
  };

  let shopifyToken: string;
  let shopifyStore: string;
  try {
    shopifyStore = await secret('shopify_store');
    const [shopifyClientId, shopifyClientSecret] = await Promise.all([secret('shopify_client_id'), secret('shopify_client_secret')]);
    const repAuth = await fetch(`https://${shopifyStore}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: shopifyClientId, client_secret: shopifyClientSecret }),
    });
    if (!repAuth.ok) throw new Error(`Auth Shopify ${repAuth.status} : ${await repAuth.text()}`);
    shopifyToken = (await repAuth.json()).access_token;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Authentification Shopify échouée';
    console.error(message);
    await journaliser(false, message);
    return reponseJson({ error: message }, 502);
  }

  try {
    const depuisIso = new Date(Date.now() - NB_JOURS_FENETRE * 24 * 60 * 60 * 1000).toISOString();
    let url: string | null =
      `https://${shopifyStore}/admin/api/${API_VERSION}/orders.json?status=any&created_at_min=${encodeURIComponent(depuisIso)}&limit=250`;
    const commandesBrutes: Record<string, any>[] = [];
    while (url) {
      const res: Response = await fetch(url, { headers: { 'X-Shopify-Access-Token': shopifyToken } });
      if (!res.ok) throw new Error(`Shopify API ${res.status} : ${await res.text()}`);
      const data = await res.json();
      for (const o of data.orders ?? []) commandesBrutes.push(o);
      const link = res.headers.get('link') ?? '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }

    // Dédoublonnage par id avant l'upsert — cf. incident #27129 (migration 0093/commandes-shopify-
    // cache.ts) : un doublon dans le même appel `.upsert()` fait échouer Postgres sur TOUT le lot
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time"), pas seulement le doublon.
    const parId = new Map<number, Record<string, any>>();
    for (const o of commandesBrutes) parId.set(o.id, o);
    const commandes = [...parId.values()].map(mapperCommandePourCache);

    const lotsEnEchec: string[] = [];
    for (let i = 0; i < commandes.length; i += TAILLE_LOT) {
      const lot = commandes.slice(i, i + TAILLE_LOT);
      const { error } = await clientAdmin.from('hub_commandes_shopify_cache').upsert(lot);
      if (error) {
        console.error(`Vérification nocturne : échec du lot ${i / TAILLE_LOT + 1} —`, error.message);
        lotsEnEchec.push(`lot ${i / TAILLE_LOT + 1} (${lot.length} commande(s)) : ${error.message}`);
      }
    }

    const message =
      lotsEnEchec.length > 0
        ? `${commandes.length} commande(s) vérifiée(s) sur ${NB_JOURS_FENETRE} jours — échec partiel : ${lotsEnEchec.join(' | ')}`
        : `${commandes.length} commande(s) vérifiée(s)/remise(s) à jour sur ${NB_JOURS_FENETRE} jours, aucune manquante détectée`;
    await journaliser(lotsEnEchec.length === 0, message, commandes.length);
    return reponseJson({ verifiees: commandes.length, lotsEnEchec }, lotsEnEchec.length === 0 ? 200 : 207);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('Vérification nocturne commandes Shopify échouée :', message);
    await journaliser(false, message);
    return reponseJson({ error: message }, 500);
  }
});
