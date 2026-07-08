-- Permet une indisponibilité sur une plage horaire (ex. 15h-18h) au lieu de la journée
-- complète uniquement. NULL = journée complète.

alter table public.conges
  add column if not exists heure_debut time,
  add column if not exists heure_fin time;

alter table public.conges
  drop constraint if exists conge_heures_coherentes;

alter table public.conges
  add constraint conge_heures_coherentes check (
    (heure_debut is null and heure_fin is null)
    or (heure_debut is not null and heure_fin is not null and heure_fin > heure_debut)
  );
