-- `semaine_reference` ('toutes' | 'premiere' | 'deuxieme', migration 0063) porte maintenant seul
-- l'information que `frequence` dupliquait ('toutes_les_semaines' <=> semaine_reference = 'toutes',
-- 'une_semaine_sur_deux' <=> 'premiere'/'deuxieme') — deux colonnes pour un seul fait pouvaient
-- diverger, on n'en garde qu'une.
alter table public.horaires_recurrents_profil drop column if exists frequence;
