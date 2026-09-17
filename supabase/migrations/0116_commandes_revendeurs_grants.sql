-- Oublié dans la migration précédente : une policy RLS ne suffit pas sans le GRANT SQL sous-jacent
-- (Postgres vérifie les deux) — confirmé par l'erreur "new row violates row-level security policy"
-- alors que la policy insert_public existait déjà bien pour anon.
grant insert on commandes_revendeurs to anon;
grant insert on commandes_revendeurs_lignes to anon;
grant select, update on commandes_revendeurs to authenticated;
grant select on commandes_revendeurs_lignes to authenticated;
