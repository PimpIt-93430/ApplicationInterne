-- Cf. discussion 2026-08-29 : migration Boxtal → Sendcloud, "et plus de boxtal". Coupe le cron
-- Boxtal (cf. migration 0084) et le remplace par un équivalent Sendcloud, même cadence (horaire) et
-- même rôle : rafraîchit le statut de livraison + pousse le premier numéro de suivi disponible vers
-- Shopify (Edge Function envoyer-suivis-sendcloud, identifiants dans Vault, cf. migration 0086).

select cron.unschedule('envoyer-suivis-boxtal-horaire');

-- État de la dernière exécution, même raison que envoi_suivis_boxtal_etat (migration 0083).
create table public.envoi_suivis_sendcloud_etat (
  id boolean primary key default true,
  derniere_execution_le timestamptz not null default now(),
  ok boolean not null,
  message text,
  declenche_par text not null,
  constraint envoi_suivis_sendcloud_etat_singleton check (id)
);

insert into public.envoi_suivis_sendcloud_etat (id, ok, message, declenche_par)
values (true, false, 'Pas encore exécuté depuis la mise en place du cron', 'init');

alter table public.envoi_suivis_sendcloud_etat enable row level security;

create policy "envoi_suivis_sendcloud_etat_select_admin" on public.envoi_suivis_sendcloud_etat
  for select using (public.is_admin());

select cron.schedule(
  'envoyer-suivis-sendcloud-horaire',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := 'https://vctrmckziomiutstndmn.supabase.co/functions/v1/envoyer-suivis-sendcloud',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHJtY2t6aW9taXV0c3RuZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDUxNDcsImV4cCI6MjA5ODQ4MTE0N30.YhYsHtQyrgyIGMAy8sXHGx0z9Q6Vft8wFtOU6waxNKw',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_envoyer_suivis_sendcloud_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
