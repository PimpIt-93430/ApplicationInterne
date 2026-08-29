// Remplace envoyer-suivis-boxtal (cf. discussion 2026-08-29, migration Boxtal → Sendcloud). Deux
// choses en une passe, pour chaque envoi Sendcloud créé depuis le Hub (cf. Pimp It Hub
// app/(hub)/commandes-shopify/actions.ts creerEtiquette) pas encore à un statut final :
//   1) Rafraîchit le statut de livraison connu (même rôle que le bouton "Vérifier les livraisons").
//   2) Si un numéro de suivi vient d'apparaître pour la première fois, le pousse vers Shopify (email
//      au client inclus).
// Ne touche JAMAIS aux commandes Shopify elles-mêmes en liste — uniquement les lignes de la table
// expeditions_sendcloud (une par étiquette créée depuis le Hub), chacune interrogée directement par
// son id Sendcloud connu.
//
// Identifiants Sendcloud/Shopify lus depuis Vault (get_vault_secret), pas Deno.env.get() — cette
// fonction tourne séparée du Hub Next.js (cf. migration 0086). Auth cron via x-cron-secret, même
// mécanisme que envoyer-suivis-boxtal/sync-ventes-sumup (cf. migration 0075).
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

const SENDCLOUD_BASE_URL = 'https://panel.sendcloud.sc/api/v3';
// Cf. lib/expeditions-sendcloud.ts STATUTS_FINAUX (Hub) — mêmes valeurs.
const STATUTS_FINAUX = new Set(['DELIVERED', 'CANCELLED']);

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
      p_nom: 'cron_envoyer_suivis_sendcloud_secret',
    });
    estAppelSysteme = !!secretAttendu && cronSecretHeader === secretAttendu;
  }
  const declenchePar = cronSecretHeader ? 'cron' : 'app';
  const journaliser = async (ok: boolean, message: string) => {
    await clientAdmin
      .from('envoi_suivis_sendcloud_etat')
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

  let sendcloudAuthHeader: string;
  let shopifyToken: string;
  let shopifyStore: string;
  try {
    const [sendcloudPublicKey, sendcloudSecretKey] = await Promise.all([secret('sendcloud_public_key'), secret('sendcloud_secret_key')]);
    sendcloudAuthHeader = `Basic ${btoa(`${sendcloudPublicKey}:${sendcloudSecretKey}`)}`;

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
    const message = e instanceof Error ? e.message : 'Authentification Sendcloud/Shopify échouée';
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

  const { data: toutesLesLignes, error: erreurSelect } = await clientAdmin.from('expeditions_sendcloud').select('*');
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
      const repEnvoi = await fetch(`${SENDCLOUD_BASE_URL}/shipments/${l.sendcloud_shipment_id}`, {
        headers: { Authorization: sendcloudAuthHeader },
      });
      if (!repEnvoi.ok) throw new Error(`Sendcloud ${repEnvoi.status} : ${await repEnvoi.text()}`);
      const dataEnvoi = await repEnvoi.json();
      const parcel = dataEnvoi?.data?.parcels?.[0];
      if (!parcel) continue;
      const statutCode: string = parcel.status?.code ?? 'inconnu';
      const trackingNumber: string | null = parcel.tracking_number ?? null;
      const trackingUrl: string | null = parcel.tracking_url ?? null;

      const premierSuiviTrouve = l.statut_suivi === 'inconnu' && Boolean(trackingNumber) && Boolean(l.fulfillment_shopify_id);
      if (premierSuiviTrouve) {
        const trackingInfoInput: Record<string, string> = { number: trackingNumber! };
        if (trackingUrl) trackingInfoInput.url = trackingUrl;

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
        .from('expeditions_sendcloud')
        .update({ statut_suivi: statutCode, suivi_url: trackingUrl, maj_le: new Date().toISOString() })
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
