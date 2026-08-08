-- Pause déjeuner optionnelle sur un shift (ex. 10h-13h puis 14h-18h) — deux colonnes horaires
-- nullables plutôt qu'une durée, pour matcher la saisie (l'admin entre une heure de début et de
-- fin de pause, pas une durée) et permettre l'affichage segmenté "10:00-13:00 · 14:00-18:00".
-- Colonnes additives, nullables : les shifts existants restent valides tels quels.
alter table public.planning_shifts add column if not exists pause_debut time;
alter table public.planning_shifts add column if not exists pause_fin time;
