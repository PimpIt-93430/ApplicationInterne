// Synchronise les ventes SumUp dans public.ventes_sumup, pour l'écran Finance (admin uniquement).
// Déclenchée par l'admin (montage de l'écran + bouton "Actualiser"), ET par un cron toutes les 15
// minutes (cf. migration 0076 — pg_cron + pg_net) pour que le CA du jour soit à jour même si
// personne n'ouvre Finance, y compris tôt le matin (un cron une fois par nuit, cf. ancienne
// migration 0070, laissait le CA à zéro jusqu'à la première ouverture de l'écran dans la journée).
//
// Trois passes distinctes et volontairement séparées :
//   1) Repart d'au plus tôt entre la dernière vente déjà enregistrée chez nous (max(horodatage)) et
//      FENETRE_JOURS_RATTRAPAGE_STATUT jours en arrière — pas juste "ce qui est arrivé après la
//      dernière vente connue", pour que la fenêtre revoie systématiquement aussi les ventes
//      récentes déjà connues et détecte un changement de statut dessus (ex. un remboursement
//      décidé après coup, SUCCESSFUL → REFUNDED sur SumUp — sans ce plancher, dès qu'une vente plus
//      récente était synchronisée la fenêtre passait devant, et le remboursement n'était plus
//      jamais rattrapé, cf. retour utilisateur : "les remboursements de la journée" absents des
//      chiffres Finance).
//   1bis) Sur cette même fenêtre, une vente déjà connue dont le statut a changé reçoit juste une
//      mise à jour de `statut` (pas un retraitement complet : les lignes produit déjà écrites ne
//      changent pas et ne doivent pas être dupliquées).
//   2) Réattribue pop_up_id/profile_id sur TOUTES les ventes déjà connues (pas seulement celles de
//      cette synchro), en pur calcul local (proximité GPS, email SumUp mappé) : ça permet à un
//      ajout tardif de coordonnées de pop-up ou de mapping salarié de corriger rétroactivement des
//      ventes déjà synchronisées, sans re-solliciter l'API SumUp.
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

const SUMUP_API = 'https://api.sumup.com';
const FENETRE_JOURS_DEFAUT = 45;
// Fenêtre de rattrapage des changements de statut (remboursements notamment) sur des ventes déjà
// connues — cf. en-tête du fichier. 14 jours couvre largement le délai habituel entre une vente et
// son remboursement éventuel, sans re-scanner tout l'historique à chaque appel.
const FENETRE_JOURS_RATTRAPAGE_STATUT = 14;
// Dimensionné pour un premier backfill (potentiellement des mois d'historique), pas pour le
// volume quotidien d'une petite structure — pour ne pas tronquer silencieusement le premier import.
const MAX_PAGES = 100;
// Précision GPS observée en conditions réelles : 10-20m. Seuil plus généreux pour absorber le
// bruit, tout en restant net pour distinguer des pop-ups qui ne sont pas à quelques mètres l'un
// de l'autre.
const SEUIL_DISTANCE_METRES = 200;
// Plafond de re-fetchs détail par invocation (chaque appel est un aller-retour HTTP séquentiel
// vers SumUp) — évite qu'un gros rattrapage (premier backfill, ou correction d'un bug affectant
// tout l'historique) dépasse la limite de temps d'exécution de l'Edge Function. Le reste est
// traité aux invocations suivantes (les lignes déjà à jour ne sont plus "changée" au prochain tour).
const MAX_DETAILS_PAR_APPEL = 250;
// Écrit au fil de l'eau plutôt qu'en un seul upsert final : si l'invocation est interrompue
// (timeout), le travail déjà fait reste enregistré au lieu d'être perdu.
const TAILLE_LOT_UPSERT = 50;

function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rayonTerre = 6371000;
  const versRad = (d: number) => (d * Math.PI) / 180;
  const dLat = versRad(lat2 - lat1);
  const dLon = versRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(versRad(lat1)) * Math.cos(versRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * rayonTerre * Math.asin(Math.sqrt(a));
}

interface TransactionResume {
  id?: string;
  transaction_id?: string;
  amount: number;
  currency: string;
  status: string;
  payment_type?: string;
  card_type?: string;
  timestamp: string;
  user?: string;
  username?: string;
}

interface TransactionDetail {
  location?: { lat: number; lon: number };
  // Contrairement à tip_amount, fee_amount n'est pas un champ de premier niveau — il est propre à
  // chaque événement de paiement (vérifié sur une vraie transaction) : on additionne les
  // événements de type PAYOUT (généralement un seul pour un paiement simple).
  events?: { type: string; fee_amount?: number }[];
  tip_amount?: number;
  // Produits du catalogue SumUp vendus dans cette transaction (nom + description + quantité) —
  // pas d'id/sku stable côté SumUp. `description` porte parfois la variante choisie (ex.
  // "36-37 · Gris" pour "Clogs") — exploité côté app pour rapprocher les ventes chaussures du
  // stock (cf. chaussures_mapping_sumup / description parsée), stocké tel quel dans
  // ventes_sumup_lignes.
  products?: { name?: string; description?: string; quantity?: number }[];
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
  const sumupApiKey = Deno.env.get('SUMUP_API_KEY')!;
  const clientAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Appel système (cron toutes les 15 minutes, cf. migration 0076) : reconnu via un secret dédié
  // transmis dans l'en-tête `x-cron-secret`, comparé à vault.decrypted_secrets (lu via la fonction
  // SQL get_vault_secret, seule façon d'accéder à Vault depuis une Edge Function qui n'a qu'un
  // accès PostgREST). Le cron transmet aussi un Authorization: Bearer <clé anon> — nécessaire pour
  // passer la vérification JWT de la plateforme (verify_jwt: true), mais c'est bien x-cron-secret
  // qui élève l'appel au rang d'appel système, pas ce header. Ancien schéma (comparaison à la clé
  // service_role elle-même) abandonné : ce secret n'a jamais pu être posé dans Vault (page
  // service_role introuvable par un outil distant), le cron échouait silencieusement chaque nuit
  // depuis sa création — cf. migration 0075 pour le détail.
  //
  // Sinon, n'importe quel compte connecté peut déclencher la synchro (pas admin-only,
  // volontairement — cf. discussion : l'écran Chaussures doit pouvoir se resynchroniser pour un
  // employé non-admin qui fait l'inventaire sur place). Rien de sensible n'est exposé par cet
  // appel : la réponse ne contient que des compteurs, et la lecture des ventes elles-mêmes reste
  // verrouillée par les RLS habituelles (ventes_sumup admin-only, ventes_sumup_lignes scopée par
  // pop-up) — seule l'écriture privilégiée (rôle exclusif du client service ci-dessous) change de
  // rien à ces droits de lecture.
  const cronSecretHeader = req.headers.get('x-cron-secret');
  let estAppelSysteme = false;
  if (cronSecretHeader) {
    const { data: secretAttendu } = await clientAdmin.rpc('get_vault_secret', {
      p_nom: 'cron_sync_ventes_sumup_secret',
    });
    estAppelSysteme = !!secretAttendu && cronSecretHeader === secretAttendu;
  }
  // Présence de l'en-tête (indépendamment de sa validité) suffit à qualifier l'appelant pour le
  // suivi ci-dessous — un secret Vault absent/désaligné doit apparaître comme un échec du cron, pas
  // disparaître silencieusement dans un 401 générique (cf. régression historique, migration 0075).
  const declenchePar = cronSecretHeader ? 'cron' : 'app';
  // cf. migration 0077 — trace la dernière exécution (succès ou échec) pour un signal de fraîcheur
  // observable dans le Hub, `cron.job_run_details` ne renseignant que l'envoi de la requête HTTP.
  const journaliser = async (ok: boolean, message: string) => {
    await clientAdmin
      .from('ventes_sumup_sync_etat')
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
  const sumupHeaders = { Authorization: `Bearer ${sumupApiKey}` };

  const body = await req.json().catch(() => ({}) as { depuis?: string; jusqua?: string });
  const maintenant = new Date();
  const jusqua = body?.jusqua ?? maintenant.toISOString();

  // Point de départ : au plus tôt entre la dernière vente déjà connue chez nous et
  // FENETRE_JOURS_RATTRAPAGE_STATUT jours en arrière (cf. en-tête du fichier — comparaison de
  // chaînes ISO8601 valide pour l'ordre chronologique, même format des deux côtés) — `depuis` en
  // paramètre reste possible pour un backfill ponctuel plus ancien.
  let depuis = body?.depuis;
  if (!depuis) {
    const { data: derniereVente } = await clientAdmin
      .from('ventes_sumup')
      .select('horodatage')
      .order('horodatage', { ascending: false })
      .limit(1)
      .maybeSingle();
    const depuisDerniereVente =
      derniereVente?.horodatage ?? new Date(maintenant.getTime() - FENETRE_JOURS_DEFAUT * 86400000).toISOString();
    const depuisRattrapage = new Date(maintenant.getTime() - FENETRE_JOURS_RATTRAPAGE_STATUT * 86400000).toISOString();
    depuis = depuisDerniereVente < depuisRattrapage ? depuisDerniereVente : depuisRattrapage;
  }

  // Un seul compte SumUp (un seul SIRET) : le merchant_code est résolu à chaque appel plutôt que
  // codé en dur, pour ne pas figer une valeur magique dans le code.
  const repMe = await fetch(`${SUMUP_API}/v0.1/me`, { headers: sumupHeaders });
  if (!repMe.ok) {
    const corpsErreur = await repMe.text().catch(() => '');
    console.error(`GET /v0.1/me a échoué : ${repMe.status} ${corpsErreur}`);
    await journaliser(false, `GET /v0.1/me a échoué (${repMe.status})`);
    return reponseJson({ error: `Connexion SumUp impossible (${repMe.status}) : ${corpsErreur.slice(0, 300)}` }, 502);
  }
  const me = await repMe.json();
  const merchantCode: string | undefined = me.merchant_profile?.merchant_code;
  if (!merchantCode) {
    console.error(`merchant_code introuvable, réponse /v0.1/me : ${JSON.stringify(me).slice(0, 500)}`);
    await journaliser(false, 'merchant_code introuvable dans la réponse SumUp');
    return reponseJson({ error: 'merchant_code introuvable' }, 502);
  }

  // 1a. Liste des transactions de la fenêtre, en suivant la pagination (l'API renvoie le lien
  // "next" comme une simple chaîne de requête à ajouter au même endpoint).
  // order=descending (le plus récent d'abord) : quand un gros arriéré s'accumule (ex. cron
  // nocturne en panne pendant des jours, cf. migration 0070), `nouvelles` est traité dans cet
  // ordre, et le plafond MAX_DETAILS_PAR_APPEL touche donc toujours l'historique le plus ancien en
  // premier — jamais les ventes du jour, qui restaient invisibles sur Finance tant que tout
  // l'arriéré plus ancien n'était pas rattrapé (symptôme observé : "les ventes d'aujourd'hui
  // n'apparaissent pas" alors que la synchro rapportait bien des centaines de transactions vues).
  const resumes: TransactionResume[] = [];
  let requete = `limit=100&oldest_time=${encodeURIComponent(depuis)}&newest_time=${encodeURIComponent(jusqua)}&order=descending`;
  let pages = 0;
  while (requete && pages < MAX_PAGES) {
    pages += 1;
    const rep = await fetch(`${SUMUP_API}/v2.1/merchants/${merchantCode}/transactions/history?${requete}`, {
      headers: sumupHeaders,
    });
    if (!rep.ok) {
      const corpsErreur = await rep.text().catch(() => '');
      console.error(`GET /transactions/history a échoué : ${rep.status} ${corpsErreur}`);
      await journaliser(false, `GET /transactions/history a échoué (${rep.status})`);
      return reponseJson(
        { error: `Échec de récupération des transactions SumUp (${rep.status}) : ${corpsErreur.slice(0, 300)}` },
        502,
      );
    }
    const page = await rep.json();
    resumes.push(...((page.items ?? []) as TransactionResume[]));
    const suivant = ((page.links ?? []) as { rel: string; href: string }[]).find((l) => l.rel === 'next');
    requete = suivant?.href ?? '';
  }

  // 1b. Sépare les transactions pas encore connues chez nous (traitement complet, y compris
  // détail/produits) de celles déjà connues dont le statut a changé depuis (ex. remboursement —
  // simple mise à jour de `statut`, cf. 1bis plus bas, jamais un retraitement complet qui
  // dupliquerait les lignes produit déjà écrites).
  const idsResumes = resumes.map((t) => t.id ?? t.transaction_id).filter((id): id is string => !!id);
  const { data: connues } = await clientAdmin
    .from('ventes_sumup')
    .select('sumup_transaction_id, statut')
    .in('sumup_transaction_id', idsResumes.length > 0 ? idsResumes : ['__aucune__']);
  const statutConnuParId = new Map((connues ?? []).map((v) => [v.sumup_transaction_id as string, v.statut as string]));
  const nouvelles = resumes.filter((r) => {
    const id = r.id ?? r.transaction_id;
    return !!id && !statutConnuParId.has(id);
  });
  const statutsChanges = resumes.filter((r) => {
    const id = r.id ?? r.transaction_id;
    if (!id) return false;
    const statutConnu = statutConnuParId.get(id);
    return statutConnu !== undefined && statutConnu !== r.status;
  });
  let statutsMisAJour = 0;
  for (const r of statutsChanges) {
    const id = (r.id ?? r.transaction_id)!;
    const { error: erreurMajStatut } = await clientAdmin
      .from('ventes_sumup')
      .update({ statut: r.status, updated_at: new Date().toISOString() })
      .eq('sumup_transaction_id', id);
    if (!erreurMajStatut) statutsMisAJour += 1;
  }

  let lignesEnAttente: Record<string, unknown>[] = [];
  // Produits SumUp par transaction, en attente d'écriture — on ne connaît le vente_id (uuid généré
  // par la base) qu'une fois la ligne ventes_sumup effectivement écrite, d'où la relecture après
  // upsert ci-dessous plutôt qu'un id généré côté fonction.
  let produitsParTransactionEnAttente = new Map<string, { name?: string; description?: string; quantity?: number }[]>();
  let totalEcrites = 0;
  let detailsRestants = MAX_DETAILS_PAR_APPEL;

  const ecrireLot = async () => {
    if (lignesEnAttente.length === 0) return;
    const { data: ventesEcrites, error: erreurUpsert } = await clientAdmin
      .from('ventes_sumup')
      .upsert(lignesEnAttente, { onConflict: 'sumup_transaction_id' })
      .select('id, sumup_transaction_id, pop_up_id, horodatage');
    if (erreurUpsert) {
      throw new Error(erreurUpsert.message);
    }
    totalEcrites += lignesEnAttente.length;

    const lignesProduits: Record<string, unknown>[] = [];
    for (const vente of ventesEcrites ?? []) {
      const produits = produitsParTransactionEnAttente.get(vente.sumup_transaction_id) ?? [];
      for (const p of produits) {
        if (!p.name || !p.quantity) continue;
        lignesProduits.push({
          vente_id: vente.id,
          pop_up_id: vente.pop_up_id,
          horodatage: vente.horodatage,
          nom_produit: p.name,
          // Chaîne vide (pas null) quand SumUp ne renvoie vraiment aucune description : null reste
          // réservé à "pas encore vérifié", pour que la passe de réparation ci-dessous sache quelles
          // lignes retenter sans reboucler indéfiniment sur celles qui n'en ont simplement pas.
          description: p.description ?? '',
          quantite: p.quantity,
        });
      }
    }
    if (lignesProduits.length > 0) {
      const { error: erreurLignes } = await clientAdmin.from('ventes_sumup_lignes').insert(lignesProduits);
      if (erreurLignes) {
        throw new Error(erreurLignes.message);
      }
    }

    lignesEnAttente = [];
    produitsParTransactionEnAttente = new Map();
  };

  try {
    for (const resume of nouvelles) {
      const id = (resume.id ?? resume.transaction_id)!;
      if (detailsRestants <= 0) {
        // Plafond atteint pour cette invocation (gros rattrapage) : le reste sera repris au
        // prochain appel, `depuis` n'ayant pas encore avancé jusqu'à cette vente.
        break;
      }
      detailsRestants -= 1;

      let detailAJour = { lat: null as number | null, lon: null as number | null, frais_montant: null as number | null, pourboire_montant: null as number | null };
      const repDetail = await fetch(`${SUMUP_API}/v2.1/merchants/${merchantCode}/transactions?id=${encodeURIComponent(id)}`, {
        headers: sumupHeaders,
      });
      if (repDetail.ok) {
        const detail: TransactionDetail = await repDetail.json();
        const fraisMontant = (detail.events ?? [])
          .filter((e) => e.type === 'PAYOUT')
          .reduce((somme, e) => somme + (e.fee_amount ?? 0), 0);
        detailAJour = {
          lat: detail.location?.lat ?? null,
          lon: detail.location?.lon ?? null,
          frais_montant: fraisMontant,
          pourboire_montant: detail.tip_amount ?? null,
        };
        if ((detail.products ?? []).length > 0) {
          produitsParTransactionEnAttente.set(id, detail.products!);
        }
      }

      lignesEnAttente.push({
        sumup_transaction_id: id,
        montant: resume.amount,
        devise: resume.currency,
        statut: resume.status,
        moyen_paiement: resume.card_type ?? resume.payment_type ?? null,
        horodatage: resume.timestamp,
        sumup_email: resume.user ?? resume.username ?? null,
        ...detailAJour,
        updated_at: new Date().toISOString(),
      });

      if (lignesEnAttente.length >= TAILLE_LOT_UPSERT) {
        await ecrireLot();
      }
    }
    await ecrireLot();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Échec de l’écriture des ventes';
    await journaliser(false, message);
    return reponseJson({ error: message }, 500);
  }

  // 1c. Répare les lignes déjà écrites avant l'ajout de `description` (cf. migration 0071) — ou
  // plus généralement toute ligne dont on n'a pas encore la description, quelle qu'en soit la
  // raison. Borné par invocation ; le reste est repris aux appels suivants (une ligne réparée n'a
  // plus de raison de réapparaître ici).
  // Gros arriéré possible au premier déploiement (une ligne par produit vendu, pas par vente) —
  // plafond aligné sur MAX_DETAILS_PAR_APPEL (même ordre de grandeur d'appels séquentiels, déjà
  // éprouvé). Les plus récentes d'abord : ce sont celles qui comptent le plus dans l'immédiat.
  const MAX_REPARATIONS_PAR_APPEL = 250;
  const { data: lignesSansDescription } = await clientAdmin
    .from('ventes_sumup_lignes')
    .select('vente_id')
    .is('description', null)
    .order('horodatage', { ascending: false })
    .limit(MAX_REPARATIONS_PAR_APPEL);
  const venteIdsAReparer = [...new Set((lignesSansDescription ?? []).map((l) => l.vente_id))];
  if (venteIdsAReparer.length > 0) {
    const { data: ventesAReparer } = await clientAdmin
      .from('ventes_sumup')
      .select('id, sumup_transaction_id')
      .in('id', venteIdsAReparer);
    for (const vente of ventesAReparer ?? []) {
      const repDetail = await fetch(
        `${SUMUP_API}/v2.1/merchants/${merchantCode}/transactions?id=${encodeURIComponent(vente.sumup_transaction_id)}`,
        { headers: sumupHeaders },
      );
      if (!repDetail.ok) continue;
      const detail: TransactionDetail = await repDetail.json();
      for (const p of detail.products ?? []) {
        if (!p.name) continue;
        await clientAdmin
          .from('ventes_sumup_lignes')
          .update({ description: p.description ?? '' })
          .eq('vente_id', vente.id)
          .eq('nom_produit', p.name)
          .is('description', null);
      }
    }
  }

  // 2. Réattribution complète (email → pop-up mappé en priorité, sinon proximité GPS ; email →
  // salarié mappé), sur toutes les ventes connues.
  const { data: popUps } = await clientAdmin
    .from('pop_ups')
    .select('id, lat, lon')
    .not('lat', 'is', null)
    .not('lon', 'is', null);
  const { data: rh } = await clientAdmin
    .from('informations_rh')
    .select('profile_id, sumup_email')
    .not('sumup_email', 'is', null);
  const profilParEmail = new Map((rh ?? []).map((r) => [(r.sumup_email as string).toLowerCase(), r.profile_id]));
  const { data: emailsPopUp } = await clientAdmin.from('sumup_emails_pop_up').select('email, pop_up_id');
  const popUpParEmail = new Map((emailsPopUp ?? []).map((e) => [e.email.toLowerCase(), e.pop_up_id]));

  const { data: toutesLesVentes } = await clientAdmin
    .from('ventes_sumup')
    .select('id, lat, lon, sumup_email, pop_up_id, profile_id, distance_pop_up_metres');

  let reattributions = 0;
  for (const vente of toutesLesVentes ?? []) {
    // Un email explicitement rattaché à un pop-up (sumup_emails_pop_up) prime sur le GPS : plus
    // fiable/intentionnel qu'une proximité calculée, et ne dépend pas de coordonnées GPS
    // renseignées ni précises. distanceTrouvee reste null dans ce cas (pas de calcul GPS fait).
    const popUpParEmailTrouve = vente.sumup_email
      ? (popUpParEmail.get((vente.sumup_email as string).toLowerCase()) ?? null)
      : null;
    let popUpIdTrouve: string | null = popUpParEmailTrouve;
    let distanceTrouvee: number | null = null;
    if (!popUpIdTrouve && vente.lat != null && vente.lon != null) {
      for (const p of popUps ?? []) {
        const d = distanceMetres(vente.lat, vente.lon, p.lat!, p.lon!);
        if (d <= SEUIL_DISTANCE_METRES && (distanceTrouvee === null || d < distanceTrouvee)) {
          distanceTrouvee = d;
          popUpIdTrouve = p.id;
        }
      }
    }
    const profileIdTrouve = vente.sumup_email ? (profilParEmail.get((vente.sumup_email as string).toLowerCase()) ?? null) : null;

    if (
      popUpIdTrouve !== vente.pop_up_id ||
      profileIdTrouve !== vente.profile_id ||
      distanceTrouvee !== vente.distance_pop_up_metres
    ) {
      reattributions += 1;
      await clientAdmin
        .from('ventes_sumup')
        .update({ pop_up_id: popUpIdTrouve, profile_id: profileIdTrouve, distance_pop_up_metres: distanceTrouvee })
        .eq('id', vente.id);
      // Les lignes produit dénormalisent pop_up_id (cf. migration 0068, RLS scopée par lieu) : à
      // maintenir à jour ici pour rester cohérentes avec la vente qu'elles détaillent.
      if (popUpIdTrouve !== vente.pop_up_id) {
        await clientAdmin
          .from('ventes_sumup_lignes')
          .update({ pop_up_id: popUpIdTrouve })
          .eq('vente_id', vente.id);
      }
    }
  }

  await journaliser(true, `OK — ${resumes.length} vues, ${totalEcrites} nouvelles/modifiées, ${reattributions} réattributions`);

  return reponseJson(
    {
      transactions_vues: resumes.length,
      nouvelles_ou_modifiees: totalEcrites,
      statuts_mis_a_jour: statutsMisAJour,
      reattributions,
      plafond_details_atteint: detailsRestants <= 0,
    },
    200,
  );
});
