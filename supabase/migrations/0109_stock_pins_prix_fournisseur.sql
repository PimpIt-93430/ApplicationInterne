alter table stock_pins
  add column prix_fournisseur numeric
  constraint stock_pins_prix_fournisseur_valeurs check (prix_fournisseur in (0.05, 0.15, 0.25, 0.30, 0.60));

-- Valeurs par défaut (retour utilisateur du 2026-09-15) : custom -> 0.15, tout le reste -> 0.05
-- (le "métallique" n'a pas de colonne dédiée en base, l'utilisateur les repassera à 0.60 à la main
-- via le sélecteur rapide).
update stock_pins set prix_fournisseur = case when custom then 0.15 else 0.05 end;
