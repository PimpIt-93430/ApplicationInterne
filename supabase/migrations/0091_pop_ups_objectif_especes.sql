-- Objectif de pourcentage d'espèces déclarées via l'application (par rapport au total espèces
-- appli + espèces SumUp non déclarées), fixé par pop-up par un admin — cf. écran RH (Demande &
-- RH > onglet RH), retour utilisateur du 2026-09-04 : "je vais mettre objectif par pop up qu'il
-- faut qu'il essaie de respecter". Nullable tant que l'admin ne l'a pas réglé (pas d'objectif
-- affiché dans ce cas, pas de valeur par défaut arbitraire).
alter table public.pop_ups
  add column objectif_pourcentage_espece_appli smallint
    constraint pop_ups_objectif_pourcentage_espece_appli_check check (
      objectif_pourcentage_espece_appli is null
      or (objectif_pourcentage_espece_appli >= 0 and objectif_pourcentage_espece_appli <= 100)
    );
