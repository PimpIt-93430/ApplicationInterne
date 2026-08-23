-- Rythme "un jour sur deux" avec des horaires DIFFÉRENTS selon la semaine (ex. mardi 10h-19h la
-- 1ère semaine, 12h-19h la 2e) : jusqu'ici une seule ligne par (profil, jour_semaine) empêchait
-- d'avoir deux horaires distincts pour le même jour. On autorise désormais une ligne par semaine
-- en incluant semaine_reference dans la contrainte d'unicité — ce qui demande qu'elle ne soit
-- jamais nulle (une ligne "toutes les semaines" prend donc la valeur 'toutes' plutôt que null).
alter table public.horaires_recurrents_profil
  drop constraint if exists horaires_recurrents_profil_semaine_reference_check;
alter table public.horaires_recurrents_profil
  add constraint horaires_recurrents_profil_semaine_reference_check
    check (semaine_reference in ('toutes', 'premiere', 'deuxieme'));

update public.horaires_recurrents_profil set semaine_reference = 'toutes' where semaine_reference is null;

alter table public.horaires_recurrents_profil
  alter column semaine_reference set default 'toutes',
  alter column semaine_reference set not null;

alter table public.horaires_recurrents_profil
  drop constraint if exists horaires_recurrents_profil_profile_id_jour_semaine_key;
alter table public.horaires_recurrents_profil
  add constraint horaires_recurrents_profil_profile_jour_semaine_key
    unique (profile_id, jour_semaine, semaine_reference);
