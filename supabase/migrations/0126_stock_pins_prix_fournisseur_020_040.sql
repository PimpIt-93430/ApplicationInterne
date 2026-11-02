-- Retour utilisateur du 2026-10-27 : ajoute 0.20 et 0.40 aux prix fournisseur autorisés des pin's
-- (liste fixe, cf. 0109_stock_pins_prix_fournisseur.sql).
alter table public.stock_pins drop constraint stock_pins_prix_fournisseur_valeurs;
alter table public.stock_pins add constraint stock_pins_prix_fournisseur_valeurs
  check (prix_fournisseur = any (array[0.05, 0.15, 0.20, 0.25, 0.30, 0.40, 0.60]));
