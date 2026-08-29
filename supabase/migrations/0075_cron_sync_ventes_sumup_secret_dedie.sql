-- La migration 0070 exigeait qu'un secret 'service_role_key' soit posé à la main dans Vault via
-- le SQL Editor du dashboard avant que le cron nocturne fonctionne. Ce secret n'a jamais été posé
-- (constat : `select * from vault.decrypted_secrets where name = 'service_role_key'` ne renvoie
-- rien), donc le cron échouait silencieusement (401) toutes les nuits depuis sa création — cf.
-- retour utilisateur "tous les jours ça ne se resynchronise pas avec SumUp".
--
-- Plutôt que de dépendre d'une clé qu'aucun outil ne peut poser à distance (la vraie clé
-- service_role n'est récupérable que depuis le Dashboard, Project Settings > API — jamais exposée
-- programmatiquement, à raison), le cron utilise désormais un secret dédié généré directement en
-- SQL (`select vault.create_secret(...)`, déjà fait pour ce projet sous le nom
-- 'cron_sync_ventes_sumup_secret') et transmis dans un en-tête custom `x-cron-secret` — vérifié
-- côté fonction (cf. supabase/functions/sync-ventes-sumup/index.ts) via `get_vault_secret` ci-
-- dessous plutôt que par comparaison à la clé service_role. L'en-tête `Authorization` transmis
-- reste nécessaire pour passer la vérification JWT de la plateforme (verify_jwt: true) : la clé
-- anon (publique, déjà exposée dans l'app) suffit puisqu'elle est un JWT valide signé par le
-- projet — elle n'autorise rien de plus par elle-même, c'est bien x-cron-secret qui élève l'appel
-- au rang d'appel système côté code de la fonction.

-- Permet à la fonction (qui n'a qu'un accès PostgREST, pas de connexion Postgres directe) de lire
-- un secret Vault par son nom, sans jamais exposer tout le contenu de vault.decrypted_secrets :
-- SECURITY DEFINER + accès restreint au seul rôle service_role (jamais anon/authenticated).
create or replace function public.get_vault_secret(p_nom text)
returns text
language sql
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nom limit 1;
$$;

revoke all on function public.get_vault_secret(text) from public;
revoke all on function public.get_vault_secret(text) from anon;
revoke all on function public.get_vault_secret(text) from authenticated;
grant execute on function public.get_vault_secret(text) to service_role;

select cron.unschedule('sync-ventes-sumup-21h-paris-hiver');
select cron.unschedule('sync-ventes-sumup-21h-paris-ete');

select cron.schedule(
  'sync-ventes-sumup-21h-paris-hiver',
  '0 20 * * *',
  $cron$
  do $$
  begin
    if extract(hour from (now() at time zone 'Europe/Paris'))::int = 21 then
      perform net.http_post(
        url := 'https://vctrmckziomiutstndmn.supabase.co/functions/v1/sync-ventes-sumup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHJtY2t6aW9taXV0c3RuZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDUxNDcsImV4cCI6MjA5ODQ4MTE0N30.YhYsHtQyrgyIGMAy8sXHGx0z9Q6Vft8wFtOU6waxNKw',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_ventes_sumup_secret' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    end if;
  end;
  $$;
  $cron$
);

select cron.schedule(
  'sync-ventes-sumup-21h-paris-ete',
  '0 19 * * *',
  $cron$
  do $$
  begin
    if extract(hour from (now() at time zone 'Europe/Paris'))::int = 21 then
      perform net.http_post(
        url := 'https://vctrmckziomiutstndmn.supabase.co/functions/v1/sync-ventes-sumup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHJtY2t6aW9taXV0c3RuZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDUxNDcsImV4cCI6MjA5ODQ4MTE0N30.YhYsHtQyrgyIGMAy8sXHGx0z9Q6Vft8wFtOU6waxNKw',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_ventes_sumup_secret' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    end if;
  end;
  $$;
  $cron$
);
