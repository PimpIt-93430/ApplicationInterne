-- Dates de vie d'un pop-up (temporaire par nature, contrairement au local) : permet de noter
-- quand il a ouvert et quand sa fermeture est prévue. Les deux sont nullables (inconnues à la
-- création, ou non pertinentes pour le local qui est permanent).
alter table public.pop_ups
  add column if not exists date_debut date,
  add column if not exists date_fin date;
