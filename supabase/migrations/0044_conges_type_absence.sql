-- Ajoute un 3e type à "conges" : "absence" (maladie ou autre, signalée après coup — pas une
-- demande à valider comme "conge", juste un constat immédiat comme "indisponibilite"). Le motif
-- (Maladie/Autre) est stocké en texte libre dans `note`, pas de colonne dédiée pour rester simple.
alter table public.conges drop constraint if exists conges_type_check;
alter table public.conges
  add constraint conges_type_check check (type in ('conge', 'indisponibilite', 'absence'));
