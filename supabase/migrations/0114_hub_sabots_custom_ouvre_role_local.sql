-- Cf. retour utilisateur du 2026-09-16 : audit complet des droits sur "Commandes Shopify" suite à
-- l'incident du jour (expeditions_laposte) — "il ne faut pas de droit pour ce truc, tout le monde
-- doit pouvoir faire ça". hub_sabots_custom (lue par decrementerStockPourVente, best-effort, pour
-- décrémenter le stock des sabots personnalisés vendus) était la dernière table de ce parcours
-- encore réservée aux admins.
drop policy if exists hub_sabots_custom_admin on hub_sabots_custom;
create policy hub_sabots_custom_ecriture on hub_sabots_custom
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
