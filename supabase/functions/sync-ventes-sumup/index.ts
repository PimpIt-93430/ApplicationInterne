// Synchronise les ventes SumUp dans public.ventes_sumup, pour l'écran Finance (admin uniquement).
// Déclenchée par l'admin (montage de l'écran + bouton "Actualiser"), pas par un cron pour
// l'instant — cf. plan : éviter d'avoir à gérer un secret pg_net/Vault pour un gain marginal à ce
// stade, le volume de ventes d'une petite structure ne justifie pas un vrai cron nocturne tout de
// suite.
//
// Deux passes distinctes et volontairement séparées :
//   1) Repart de la dernière vente déjà enregistrée chez nous (max(horodatage)) et ne va chercher
//      à SumUp que ce qui est arrivé après — pas de rescan ni de comparaison ligne à ligne d'une
//      fenêtre glissante. Simple, mais ne rattrape pas un remboursement tardif sur une vente déjà
//      synchronisée (cf. passe 2, qui elle tourne sur tout l'historique).
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

  // Même schéma d'auth que inviter-employe : le jeton de l'appelant sert uniquement à vérifier
  // que c'est bien un admin, jamais à faire l'écriture privilégiée (rôle exclusif du client
  // service ci-dessous).
  const clientAppelant = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: erreurUser,
  } = await clientAppelant.auth.getUser();
  if (erreurUser || !user) {
    return reponseJson({ error: 'Non authentifié' }, 401);
  }

  const { data: profil, error: erreurProfil } = await clientAppelant
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (erreurProfil || profil?.role !== 'admin') {
    return reponseJson({ error: 'Réservé aux administrateurs' }, 403);
  }

  const clientAdmin = createClient(supabaseUrl, serviceRoleKey);
  const sumupHeaders = { Authorization: `Bearer ${sumupApiKey}` };

  const body = await req.json().catch(() => ({}) as { depuis?: string; jusqua?: string });
  const maintenant = new Date();
  const jusqua = body?.jusqua ?? maintenant.toISOString();

  // Point de départ : la dernière vente déjà connue chez nous (pas de fenêtre glissante à
  // rescanner) — `depuis` en paramètre reste possible pour un backfill ponctuel plus ancien.
  let depuis = body?.depuis;
  if (!depuis) {
    const { data: derniereVente } = await clientAdmin
      .from('ventes_sumup')
      .select('horodatage')
      .order('horodatage', { ascending: false })
      .limit(1)
      .maybeSingle();
    depuis = derniereVente?.horodatage ?? new Date(maintenant.getTime() - FENETRE_JOURS_DEFAUT * 86400000).toISOString();
  }

  // Un seul compte SumUp (un seul SIRET) : le merchant_code est résolu à chaque appel plutôt que
  // codé en dur, pour ne pas figer une valeur magique dans le code.
  const repMe = await fetch(`${SUMUP_API}/v0.1/me`, { headers: sumupHeaders });
  if (!repMe.ok) {
    return reponseJson({ error: 'Connexion SumUp impossible' }, 502);
  }
  const me = await repMe.json();
  const merchantCode: string | undefined = me.merchant_profile?.merchant_code;
  if (!merchantCode) {
    return reponseJson({ error: 'merchant_code introuvable' }, 502);
  }

  // 1a. Liste des transactions de la fenêtre, en suivant la pagination (l'API renvoie le lien
  // "next" comme une simple chaîne de requête à ajouter au même endpoint).
  const resumes: TransactionResume[] = [];
  let requete = `limit=100&oldest_time=${encodeURIComponent(depuis)}&newest_time=${encodeURIComponent(jusqua)}&order=ascending`;
  let pages = 0;
  while (requete && pages < MAX_PAGES) {
    pages += 1;
    const rep = await fetch(`${SUMUP_API}/v2.1/merchants/${merchantCode}/transactions/history?${requete}`, {
      headers: sumupHeaders,
    });
    if (!rep.ok) {
      return reponseJson({ error: 'Échec de récupération des transactions SumUp' }, 502);
    }
    const page = await rep.json();
    resumes.push(...((page.items ?? []) as TransactionResume[]));
    const suivant = ((page.links ?? []) as { rel: string; href: string }[]).find((l) => l.rel === 'next');
    requete = suivant?.href ?? '';
  }

  // 1b. Ne garde que les transactions pas encore connues chez nous (par id) — `depuis` étant déjà
  // la dernière vente enregistrée, ça ne devrait normalement être qu'une poignée de ventes neuves.
  const idsResumes = resumes.map((t) => t.id ?? t.transaction_id).filter((id): id is string => !!id);
  const { data: idsConnus } = await clientAdmin
    .from('ventes_sumup')
    .select('sumup_transaction_id')
    .in('sumup_transaction_id', idsResumes.length > 0 ? idsResumes : ['__aucune__']);
  const ensembleIdsConnus = new Set((idsConnus ?? []).map((v) => v.sumup_transaction_id));
  const nouvelles = resumes.filter((r) => {
    const id = r.id ?? r.transaction_id;
    return !!id && !ensembleIdsConnus.has(id);
  });

  let lignesEnAttente: Record<string, unknown>[] = [];
  let totalEcrites = 0;
  let detailsRestants = MAX_DETAILS_PAR_APPEL;

  const ecrireLot = async () => {
    if (lignesEnAttente.length === 0) return;
    const { error: erreurUpsert } = await clientAdmin
      .from('ventes_sumup')
      .upsert(lignesEnAttente, { onConflict: 'sumup_transaction_id' });
    if (erreurUpsert) {
      throw new Error(erreurUpsert.message);
    }
    totalEcrites += lignesEnAttente.length;
    lignesEnAttente = [];
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
    return reponseJson({ error: e instanceof Error ? e.message : 'Échec de l’écriture des ventes' }, 500);
  }

  // 2. Réattribution complète (proximité GPS + email SumUp mappé), sur toutes les ventes connues.
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

  const { data: toutesLesVentes } = await clientAdmin
    .from('ventes_sumup')
    .select('id, lat, lon, sumup_email, pop_up_id, profile_id, distance_pop_up_metres');

  let reattributions = 0;
  for (const vente of toutesLesVentes ?? []) {
    let popUpIdTrouve: string | null = null;
    let distanceTrouvee: number | null = null;
    if (vente.lat != null && vente.lon != null) {
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
    }
  }

  return reponseJson(
    {
      transactions_vues: resumes.length,
      nouvelles_ou_modifiees: totalEcrites,
      reattributions,
      plafond_details_atteint: detailsRestants <= 0,
    },
    200,
  );
});
