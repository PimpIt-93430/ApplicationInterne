// Deux choses en une passe, pour chaque expédition Boxtal créée depuis le Hub (cf. Pimp It Hub
// app/(hub)/commandes-shopify/actions.ts creerEtiquette) pas encore à un statut final :
//   1) Rafraîchit le statut de livraison connu (même rôle que le bouton "Vérifier les livraisons"
//      du Hub, cf. discussion 2026-08-29 : "il faudrait que ça fasse un vérifier les livraisons" —
//      en cron plutôt qu'à chaque visite de page, pour ne pas ralentir le chargement ni marteler
//      Boxtal à chaque ouverture).
//   2) Si un numéro de suivi vient d'apparaître pour la première fois (Boxtal met parfois plusieurs
//      minutes à le générer, cf. discussion 2026-08-29 : "il me faut absolument le lien de suivi"),
//      le pousse vers Shopify (email au client inclus).
// Ne touche JAMAIS aux commandes Shopify elles-mêmes en liste (pas de GET /orders) — uniquement les
// lignes de la table expeditions_boxtal (une par étiquette créée depuis le Hub, donc un tout petit
// nombre), chacune interrogée directement par son id Boxtal connu. Ne "va pas chercher les 25000
// commandes Shopify" (cf. discussion 2026-08-29).
//
// Identifiants Boxtal/Shopify lus depuis Vault (get_vault_secret), pas Deno.env.get() — cette
// fonction tourne séparée du Hub Next.js, pas d'accès à ses variables d'environnement ni au
// dashboard Supabase pour y poser des "Edge Function secrets" (cf. migration 0082). Auth cron via
// x-cron-secret, même mécanisme que sync-ventes-sumup (cf. migration 0075).
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

const BOXTAL_BASE_URL = 'https://api.boxtal.com';
// Cf. lib/expeditions-boxtal.ts STATUTS_FINAUX (Hub) — mêmes valeurs, inutile de re-solliciter
// Boxtal pour une expédition déjà arrivée à son terme.
const STATUTS_FINAUX = new Set(['DELIVERED', 'RETURNED']);

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

  // Cf. sync-ventes-sumup/index.ts pour le détail de ce mécanisme (même pattern, cf. migration
  // 0075) : appel système reconnu via x-cron-secret comparé à un secret Vault dédié.
  const cronSecretHeader = req.headers.get('x-cron-secret');
  let estAppelSysteme = false;
  if (cronSecretHeader) {
    const { data: secretAttendu } = await clientAdmin.rpc('get_vault_secret', {
      p_nom: 'cron_envoyer_suivis_boxtal_secret',
    });
    estAppelSysteme = !!secretAttendu && cronSecretHeader === secretAttendu;
  }
  const declenchePar = cronSecretHeader ? 'cron' : 'app';
  const journaliser = async (ok: boolean, message: string) => {
    await clientAdmin
      .from('envoi_suivis_boxtal_etat')
      .upsert({ id: true, derniere_execution_le: new Date().toISOString(), ok, message, declenche_par: declenchePar });
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

  let boxtalToken: string;
  let shopifyToken: string;
  let shopifyStore: string;
  try {
    const [boxtalAccessKey, boxtalSecretKey] = await Promise.all([secret('boxtal_access_key'), secret('boxtal_secret_key')]);
    const basic = btoa(`${boxtalAccessKey}:${boxtalSecretKey}`);
    const repBoxtalAuth = await fetch(`${BOXTAL_BASE_URL}/iam/account-app/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!repBoxtalAuth.ok) throw new Error(`Auth Boxtal ${repBoxtalAuth.status} : ${await repBoxtalAuth.text()}`);
    boxtalToken = (await repBoxtalAuth.json()).accessToken;

    shopifyStore = await secret('shopify_store');
    const [shopifyClientId, shopifyClientSecret] = await Promise.all([secret('shopify_client_id'), secret('shopify_client_secret')]);
    const repShopifyAuth = await fetch(`https://${shopifyStore}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: shopifyClientId, client_secret: shopifyClientSecret }),
    });
    if (!repShopifyAuth.ok) throw new Error(`Auth Shopify ${repShopifyAuth.status} : ${await repShopifyAuth.text()}`);
    shopifyToken = (await repShopifyAuth.json()).access_token;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Authentification Boxtal/Shopify échouée';
    console.error(message);
    await journaliser(false, message);
    return reponseJson({ error: message }, 502);
  }

  const shopifyGraphQL = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`https://${shopifyStore}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': shopifyToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Shopify GraphQL ${res.status} : ${await res.text()}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);
    return json.data;
  };

  // Toutes les expéditions Hub pas encore à un statut final — cf. en-tête du fichier. Un tout petit
  // nombre par nature (une ligne par étiquette créée depuis le Hub), jamais la liste complète des
  // commandes Shopify.
  const { data: toutesLesLignes, error: erreurSelect } = await clientAdmin.from('expeditions_boxtal').select('*');
  if (erreurSelect) {
    await journaliser(false, erreurSelect.message);
    return reponseJson({ error: erreurSelect.message }, 500);
  }
  const lignes = (toutesLesLignes ?? []).filter((l) => !STATUTS_FINAUX.has(l.statut_suivi));

  let statutsMisAJour = 0;
  let suivisEnvoyes = 0;
  let echecs = 0;
  for (const l of lignes) {
    try {
      const repSuivi = await fetch(`${BOXTAL_BASE_URL}/shipping/v3.1/shipping-order/${l.boxtal_shipping_order_id}/tracking`, {
        headers: { Authorization: `Bearer ${boxtalToken}` },
      });
      if (repSuivi.status === 422) continue; // pas encore de suivi disponible côté Boxtal
      if (!repSuivi.ok) throw new Error(`Suivi Boxtal ${repSuivi.status} : ${await repSuivi.text()}`);
      const dataSuivi = await repSuivi.json();
      const tracking = dataSuivi?.content?.[0];
      if (!tracking) continue;

      // Premier numéro de suivi trouvé pour une commande déjà "traitée" côté Shopify (fulfillment
      // créé) : à pousser vers Shopify — jamais ensuite, pour ne pas renvoyer l'email de suivi au
      // client à chaque passage du cron (cf. discussion 2026-08-29 : "il me faut absolument le
      // lien de suivi").
      const premierSuiviTrouve = l.statut_suivi === 'inconnu' && Boolean(tracking.trackingNumber) && Boolean(l.fulfillment_shopify_id);
      if (premierSuiviTrouve) {
        const trackingInfoInput: Record<string, string> = { number: tracking.trackingNumber };
        if (tracking.packageTrackingUrl) trackingInfoInput.url = tracking.packageTrackingUrl;

        const dataMaj = await shopifyGraphQL<{
          fulfillmentTrackingInfoUpdateV2: { userErrors: { field: string[]; message: string }[] };
        }>(
          `mutation($fulfillmentId: ID!, $trackingInfoInput: FulfillmentTrackingInput!, $notifyCustomer: Boolean) {
            fulfillmentTrackingInfoUpdateV2(fulfillmentId: $fulfillmentId, trackingInfoInput: $trackingInfoInput, notifyCustomer: $notifyCustomer) {
              userErrors { field message }
            }
          }`,
          { fulfillmentId: l.fulfillment_shopify_id, trackingInfoInput, notifyCustomer: true },
        );
        const erreursMaj = dataMaj.fulfillmentTrackingInfoUpdateV2.userErrors;
        if (erreursMaj.length) throw new Error(erreursMaj.map((e) => e.message).join(', '));
        suivisEnvoyes++;
      }

      await clientAdmin
        .from('expeditions_boxtal')
        .update({ statut_suivi: tracking.status, suivi_url: tracking.packageTrackingUrl ?? null, maj_le: new Date().toISOString() })
        .eq('id', l.id);
      statutsMisAJour++;
    } catch (e) {
      echecs++;
      console.error(`Suivi ${l.commande_nom} échoué :`, e instanceof Error ? e.message : e);
    }
  }

  await journaliser(
    true,
    `OK — ${lignes.length} expédition(s) vue(s), ${statutsMisAJour} statut(s) mis à jour, ${suivisEnvoyes} suivi(s) envoyé(s) à Shopify, ${echecs} échec(s)`,
  );
  return reponseJson({ vues: lignes.length, statutsMisAJour, suivisEnvoyes, echecs }, 200);
});
