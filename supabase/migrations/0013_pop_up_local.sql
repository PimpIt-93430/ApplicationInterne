-- Distingue le local (boutique permanente) des pop-ups éphémères : un seul lieu peut être
-- marqué "local" à la fois, il est prioritaire lors de la génération automatique du planning.

alter table public.pop_ups
  add column if not exists est_local boolean not null default false;

create unique index if not exists pop_ups_un_seul_local
  on public.pop_ups (est_local)
  where est_local;
