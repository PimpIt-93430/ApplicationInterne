-- Signalement rapide d'un pin trouvé physiquement mais absent du catalogue : ajout avec juste une
-- photo (nom provisoire), à compléter ensuite (nom réel, seuil, poids). L'écriture sur stock_pins
-- est déjà ouverte à tout utilisateur connecté (migration 0020), pas de nouvelle policy nécessaire.
alter table public.stock_pins
  add column if not exists a_completer boolean not null default false;
