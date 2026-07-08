-- Quantité à ramener pour ce pin (rempli/ajusté manuellement pour l'instant ; sera
-- automatisé plus tard en fonction de ce qui est effectivement ramené).

alter table public.stock_pins
  add column if not exists stock_a_ramener numeric not null default 0;
