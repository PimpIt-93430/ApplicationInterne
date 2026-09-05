-- Cf. retour utilisateur du 2026-09-05 (suite à l'incident #27129, cf. migration 0093) : "il
-- faudrait une fonction tous les soirs qui vérifie qu'on a bien toutes les commandes [...] et
-- remettre celles qui y sont pas" — filet de sécurité nocturne indépendant de la synchro
-- incrémentale du Hub (Edge Function verifier-commandes-shopify : re-télécharge les commandes
-- Shopify des 3 derniers jours et les upsert dans hub_commandes_shopify_cache, idempotent).

create table public.verification_commandes_shopify_etat (
  id boolean primary key default true,
  derniere_execution_le timestamptz not null default now(),
  ok boolean not null,
  message text,
  declenche_par text not null,
  nb_commandes_verifiees integer not null default 0,
  constraint verification_commandes_shopify_etat_singleton check (id)
);

insert into public.verification_commandes_shopify_etat (id, ok, message, declenche_par)
values (true, false, 'Pas encore exécuté depuis la mise en place du cron', 'init');

alter table public.verification_commandes_shopify_etat enable row level security;

create policy "verification_commandes_shopify_etat_select_admin" on public.verification_commandes_shopify_etat
  for select using (public.is_admin());

-- Une fois par nuit suffit (filet de sécurité, pas une synchro temps réel) — 3h UTC, creux
-- d'activité (4h ou 5h heure de Paris selon la saison, aucune précision requise ici contrairement
-- au cron de clôture des ventes SumUp).
select cron.schedule(
  'verifier-commandes-shopify-nocturne',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://vctrmckziomiutstndmn.supabase.co/functions/v1/verifier-commandes-shopify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHJtY2t6aW9taXV0c3RuZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDUxNDcsImV4cCI6MjA5ODQ4MTE0N30.YhYsHtQyrgyIGMAy8sXHGx0z9Q6Vft8wFtOU6waxNKw',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_verifier_commandes_shopify_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);

-- La valeur du secret elle-même n'est volontairement PAS dans ce fichier — posée directement en
-- session via vault.create_secret(valeur, 'cron_verifier_commandes_shopify_secret'), même
-- mécanisme que les crons existants (cf. migration 0075).
