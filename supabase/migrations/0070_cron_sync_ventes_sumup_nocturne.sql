-- Cron nocturne (21h heure de Paris) pour sync-ventes-sumup, en plus de la synchro à l'ouverture
-- de Finance déjà en place — pour que les ventes restent à jour même si personne n'ouvre l'écran
-- pendant des jours/semaines (cf. constat : aucune synchro depuis un mois avant cette migration).
--
-- pg_cron programme uniquement en UTC (pas de fuseau horaire natif) : deux jobs, un pour l'heure
-- UTC d'hiver (CET, UTC+1 → 20h UTC) et un pour l'été (CEST, UTC+2 → 19h UTC), chacun protégé par
-- une vérification de l'heure Paris réelle au moment de l'exécution (via `at time zone`, qui gère
-- le changement d'heure automatiquement) — un seul des deux tire réellement un jour donné.
--
-- La fonction accepte cet appel système via un en-tête Authorization = la clé service role
-- elle-même (cf. sync-ventes-sumup/index.ts, `estAppelSysteme`) : cette clé doit être posée une
-- fois dans Vault via le SQL Editor du dashboard (jamais dans une migration versionnée) :
--   select vault.create_secret('<clé service_role, Project Settings > API>', 'service_role_key');
-- Tant que ce secret n'existe pas, les appels échouent silencieusement (401, sans effet) — aucun
-- risque à appliquer cette migration avant.
create extension if not exists pg_net;

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
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
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
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
    end if;
  end;
  $$;
  $cron$
);
