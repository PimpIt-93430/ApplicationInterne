-- Cf. discussion 2026-08-29 : "lance un cron toutes les 24 qui envoie les numéros de suivi à
-- shopify pour toutes les commandes marquées comme expédié qui en ont pas et où le numéro de suivi
-- est dispo dans boxtal". Edge Function envoyer-suivis-boxtal (identifiants Boxtal/Shopify + secret
-- cron dans Vault, cf. migration 0082).

-- État de la dernière exécution, même raison que ventes_sumup_sync_etat (migration 0077) : un cron
-- qui échoue silencieusement (ex. secret Vault absent/désaligné) ne laisse sinon aucune trace
-- observable — `cron.job_run_details` ne renseigne que l'envoi de la requête HTTP, pas son issue
-- réelle côté fonction.
create table public.envoi_suivis_boxtal_etat (
  id boolean primary key default true,
  derniere_execution_le timestamptz not null default now(),
  ok boolean not null,
  message text,
  declenche_par text not null,
  constraint envoi_suivis_boxtal_etat_singleton check (id)
);

insert into public.envoi_suivis_boxtal_etat (id, ok, message, declenche_par)
values (true, false, 'Pas encore exécuté depuis la mise en place du cron', 'init');

alter table public.envoi_suivis_boxtal_etat enable row level security;

create policy "envoi_suivis_boxtal_etat_select_admin" on public.envoi_suivis_boxtal_etat
  for select using (public.is_admin());

select cron.schedule(
  'envoyer-suivis-boxtal-quotidien',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://vctrmckziomiutstndmn.supabase.co/functions/v1/envoyer-suivis-boxtal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHJtY2t6aW9taXV0c3RuZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDUxNDcsImV4cCI6MjA5ODQ4MTE0N30.YhYsHtQyrgyIGMAy8sXHGx0z9Q6Vft8wFtOU6waxNKw',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_envoyer_suivis_boxtal_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
