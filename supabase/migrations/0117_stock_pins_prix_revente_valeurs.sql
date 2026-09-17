-- Retour utilisateur du 2026-09-17 : ajouter le prix de revente à côté du prix fournisseur dans
-- l'écran de gestion des prix (app/(hub)/pins-prix). Même verrou que prix_fournisseur (migration
-- stock_pins_prix_fournisseur) : valeurs réellement utilisées confirmées par requête
-- (0.25/0.40/0.70/1.00/1.25 sur 636 pins déjà tarifés) — 4 pins avaient 0€ (Chaine Perle/Pastèque
-- 2/Chaine Argenté/Chaine en Or), un placeholder plutôt qu'un vrai prix : remis à null pour rejoindre
-- les "sans prix" (l'écran /revendeurs les excluait déjà via price_ht is not null, mais un futur 0€
-- explicite y aurait affiché un article gratuit sans que ça ne soit voulu).
update stock_pins set prix_revente_ht = null where prix_revente_ht = 0;

alter table stock_pins add constraint stock_pins_prix_revente_valeurs
  check (prix_revente_ht = any (array[0.25, 0.40, 0.70, 1.00, 1.25]));
