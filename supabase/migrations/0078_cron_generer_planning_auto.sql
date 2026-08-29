-- Génération automatique du planning des prochaines semaines (cf. Edge Function
-- generer-planning-auto) — cf. retour utilisateur : "avant ça générait tout automatiquement
-- pourquoi tu fais pas automatique... à partir du 31 août". Jusqu'ici, le bouton "Générer depuis
-- les horaires récurrents" du Hub ne couvrait que la semaine affichée à l'écran ; ce cron répète
-- la même génération pour une fenêtre glissante de plusieurs semaines, toutes les nuits.
--
-- Même schéma d'authentification que sync-ventes-sumup (cf. migrations 0075/0076) : secret dédié
-- posé dans Vault, transmis dans l'en-tête x-cron-secret, vérifié côté fonction via
-- get_vault_secret (déjà créée par la migration 0075, réutilisée ici).
select vault.create_secret(gen_random_uuid()::text, 'cron_generer_planning_secret');

select cron.schedule(
  'generer-planning-auto-nocturne',
  '30 2 * * *',
  $cron$
  select net.http_post(
    url := 'https://vctrmckziomiutstndmn.supabase.co/functions/v1/generer-planning-auto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHJtY2t6aW9taXV0c3RuZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDUxNDcsImV4cCI6MjA5ODQ4MTE0N30.YhYsHtQyrgyIGMAy8sXHGx0z9Q6Vft8wFtOU6waxNKw',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_generer_planning_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
