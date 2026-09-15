-- Cf. retour utilisateur du 2026-09-15 : "les commandes shopify ne sortent que sur Octave Blanc" —
-- la page est bien visible pour le rôle 'local' (cf. Hub app/(hub)/layout.tsx), mais les deux
-- tables qui l'alimentent étaient restreintes aux admins (is_admin()), contrairement à leur voisine
-- hub_purchase_orders (Commandes fournisseurs, même catégorie "Logistique") qui autorise déjà tout
-- utilisateur authentifié. Résultat : la synchro en tâche de fond échouait silencieusement et la
-- lecture renvoyait 0 ligne pour l'équipe du local.
drop policy if exists hub_commandes_shopify_cache_admin on hub_commandes_shopify_cache;
create policy hub_commandes_shopify_cache_ecriture on hub_commandes_shopify_cache
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists hub_commandes_shopify_sync_etat_admin on hub_commandes_shopify_sync_etat;
create policy hub_commandes_shopify_sync_etat_ecriture on hub_commandes_shopify_sync_etat
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
