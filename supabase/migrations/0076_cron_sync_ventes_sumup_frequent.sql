-- Le cron nocturne unique (21h Paris, cf. migrations 0070/0075) laissait le CA du jour à zéro
-- toute la matinée : aucune synchro SumUp ne se déclenchait avant que quelqu'un ouvre
-- Finance/Chaussures dans l'app, ou jusqu'au soir suivant — cf. retour utilisateur : "le CA de
-- SumUp ne sort jamais le matin". Remplacé par une synchro toutes les 15 minutes, en continu —
-- la fenêtre de synchro (`depuis`) dans la fonction repart déjà de la dernière vente connue, donc
-- un appel sans rien de nouveau ne coûte qu'un aller-retour SumUp à vide (pas de retraitement).
--
-- Le secret 'cron_sync_ventes_sumup_secret' (posé dans Vault, cf. migration 0075) et la clé anon
-- transmise dans Authorization restent inchangés — seule la fréquence change, plus besoin du garde-
-- fou horaire Paris propre à un déclenchement unique par jour.

select cron.unschedule('sync-ventes-sumup-21h-paris-hiver');
select cron.unschedule('sync-ventes-sumup-21h-paris-ete');

select cron.schedule(
  'sync-ventes-sumup-toutes-les-15-min',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://vctrmckziomiutstndmn.supabase.co/functions/v1/sync-ventes-sumup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjdHJtY2t6aW9taXV0c3RuZG1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDUxNDcsImV4cCI6MjA5ODQ4MTE0N30.YhYsHtQyrgyIGMAy8sXHGx0z9Q6Vft8wFtOU6waxNKw',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_ventes_sumup_secret' limit 1)
    ),
    body := '{}'::jsonb,
    -- 55s (pas 20s) : un rattrapage avec plusieurs transactions neuves enchaîne des appels
    -- séquentiels vers l'API SumUp (détail + produits par transaction, cf. sync-ventes-sumup/
    -- index.ts) et peut dépasser 20s — constaté en test (timeout pg_net à 20s sur un simple
    -- rattrapage de 12 ventes, cf. net._http_response.error_msg). La fonction avait malgré tout
    -- terminé son travail côté serveur, mais rien ne le garantit : sans marge de timeout on perd
    -- toute visibilité sur l'issue réelle de l'appel (cron.job_run_details marque "succeeded" dès
    -- que la requête HTTP est envoyée, pas quand elle aboutit).
    timeout_milliseconds := 55000
  );
  $cron$
);
