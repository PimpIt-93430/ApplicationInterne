-- Une personne peut désormais être attribuée à plusieurs lieux (ex. le local ET un pop-up),
-- remplace le pop_up_id unique par une table d'affectations many-to-many. Les admins n'ont pas
-- besoin d'y figurer : ils sont considérés attribués à tous les lieux (vérifié côté code via
-- role = 'admin'), puisqu'ils gèrent déjà leur planning entièrement à la main.
--
-- Seules les personnes attribuées à un lieu peuvent y être planifiées (à la main ou via la
-- génération automatique) — sauf les admins, toujours autorisés partout.

create table if not exists public.profil_pop_ups (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, pop_up_id)
);
create index if not exists profil_pop_ups_profile_idx on public.profil_pop_ups (profile_id);
create index if not exists profil_pop_ups_pop_up_idx on public.profil_pop_ups (pop_up_id);

insert into public.profil_pop_ups (profile_id, pop_up_id)
select id, pop_up_id from public.profiles where pop_up_id is not null
on conflict do nothing;

alter table public.profil_pop_ups enable row level security;

drop policy if exists "profil_pop_ups_lecture" on public.profil_pop_ups;
create policy "profil_pop_ups_lecture" on public.profil_pop_ups
  for select using (auth.uid() is not null);

drop policy if exists "profil_pop_ups_ecriture_admin" on public.profil_pop_ups;
create policy "profil_pop_ups_ecriture_admin" on public.profil_pop_ups
  for all using (public.is_admin()) with check (public.is_admin());

-- L'horaire récurrent précise désormais lui-même à quel lieu il correspond (une personne
-- attribuée à deux lieux peut avoir un horaire différent selon le jour, ex. lundi au local,
-- mardi au pop-up) : on part de l'ancien pop_up_id de chaque profil comme valeur de départ.
alter table public.horaires_recurrents_profil
  add column if not exists pop_up_id uuid references public.pop_ups (id) on delete cascade;

update public.horaires_recurrents_profil h
set pop_up_id = p.pop_up_id
from public.profiles p
where h.profile_id = p.id and h.pop_up_id is null and p.pop_up_id is not null;

-- Sécurité : un horaire orphelin (créé pour un profil qui n'avait déjà plus de pop-up assigné)
-- ne peut pas être rattaché à un lieu ; on le supprime plutôt que de bloquer la migration.
delete from public.horaires_recurrents_profil where pop_up_id is null;

alter table public.horaires_recurrents_profil
  alter column pop_up_id set not null;

alter table public.profiles drop column if exists pop_up_id;
