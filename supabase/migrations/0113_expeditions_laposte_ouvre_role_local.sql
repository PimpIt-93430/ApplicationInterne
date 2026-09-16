-- Cf. incident du 2026-09-16 : Edgar (rôle 'local', pas admin) a utilisé "Créer et imprimer toutes
-- les étiquettes" sur des commandes légères (routées vers La Poste) — l'étiquette a bien été créée
-- ET FACTURÉE chez La Poste, le fulfillment Shopify marqué "expédié" avec un vrai numéro de suivi,
-- mais l'écriture dans expeditions_laposte (qui contient le PDF de l'étiquette, non retéléchargeable
-- ensuite selon l'API La Poste) était bloquée par RLS car réservée aux admins — contrairement à sa
-- jumelle expeditions_sendcloud, déjà ouverte à tout utilisateur authentifié. 71 commandes touchées
-- entre 08:47 et 08:55 UTC (10:47-10:55 heure française).
drop policy if exists expeditions_laposte_insert_admin on expeditions_laposte;
drop policy if exists expeditions_laposte_select_admin on expeditions_laposte;
drop policy if exists expeditions_laposte_update_admin on expeditions_laposte;

create policy expeditions_laposte_insert on expeditions_laposte for insert with check (auth.uid() is not null);
create policy expeditions_laposte_select on expeditions_laposte for select using (auth.uid() is not null);
create policy expeditions_laposte_update on expeditions_laposte for update using (auth.uid() is not null);
