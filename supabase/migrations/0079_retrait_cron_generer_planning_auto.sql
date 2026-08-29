-- Retiré à la demande de l'utilisateur juste après mise en place (migration 0078) : la génération
-- auto sur toute l'année (Edge Function generer-planning-auto) reste disponible, mais déclenchée
-- à la demande plutôt que par un cron nocturne — pas besoin d'un run automatique chaque nuit tant
-- que les horaires récurrents ne changent pas tous les jours.
select cron.unschedule('generer-planning-auto-nocturne');
