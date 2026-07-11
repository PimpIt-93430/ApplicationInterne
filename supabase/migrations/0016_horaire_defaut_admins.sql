-- Par défaut, chaque admin est attribué au local de 10h à 19h tous les jours sauf le dimanche
-- (sauf indisponibilité déclarée, ou horaire édité dans Équipe pour un jour où il est plutôt
-- attitré à un pop-up ce jour-là, ou créneau ajouté à la main ailleurs — ces trois cas sont déjà
-- gérés génériquement par genererPlanning). Reste éditable comme n'importe qui dans Équipe.
--
-- Backfill pour les admins existants, puis trigger pour que toute future promotion en admin
-- reçoive le même horaire par défaut automatiquement.

create or replace function public.seed_horaire_admin_local()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  id_local uuid;
begin
  if new.role <> 'admin' then
    return new;
  end if;

  select id into id_local from public.pop_ups where est_local limit 1;
  if id_local is null then
    return new;
  end if;

  insert into public.horaires_recurrents_profil (profile_id, pop_up_id, jour_semaine, heure_debut, heure_fin, actif)
  select new.id, id_local, jour, '10:00:00', '19:00:00', true
  from generate_series(0, 5) as jour
  on conflict (profile_id, jour_semaine) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_horaire_admin_local_trigger on public.profiles;
create trigger seed_horaire_admin_local_trigger
  after insert or update of role on public.profiles
  for each row
  execute function public.seed_horaire_admin_local();

-- Backfill pour les admins déjà existants (le trigger ne s'applique qu'aux futurs changements).
insert into public.horaires_recurrents_profil (profile_id, pop_up_id, jour_semaine, heure_debut, heure_fin, actif)
select p.id, l.id, jour, '10:00:00', '19:00:00', true
from public.profiles p
cross join (select id from public.pop_ups where est_local limit 1) l
cross join generate_series(0, 5) as jour
where p.role = 'admin'
on conflict (profile_id, jour_semaine) do nothing;
