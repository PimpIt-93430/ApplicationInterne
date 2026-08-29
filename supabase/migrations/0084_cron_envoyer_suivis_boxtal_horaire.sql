-- Cf. discussion 2026-08-29 : "il faudrait que à chaque fois que je vais sur la page commande
-- shopify ça fasse un vérifier les livraisons ou alors un cron aussi" — la fonction
-- envoyer-suivis-boxtal fait désormais aussi le travail du bouton "Vérifier les livraisons" du Hub
-- (rafraîchit le statut de livraison de toute expédition pas encore finale, pas seulement celles
-- sans suivi), donc passée de quotidien à toutes les heures pour rester proche du temps réel côté
-- affichage — reste très bon marché : un tout petit nombre de lignes (une par étiquette créée
-- depuis le Hub), jamais la liste complète des commandes Shopify.

select cron.unschedule('envoyer-suivis-boxtal-quotidien');

select cron.schedule(
  'envoyer-suivis-boxtal-horaire',
  '0 * * * *',
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
