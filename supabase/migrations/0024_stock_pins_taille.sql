-- Taille du pin (petit/moyen/gros) : servira plus tard à calculer combien de pins rentrent dans
-- une boîte. Nullable, à renseigner pin par pin depuis le catalogue (pas de valeur par défaut).
alter table public.stock_pins
  add column if not exists taille text check (taille in ('petit', 'moyen', 'gros'));
