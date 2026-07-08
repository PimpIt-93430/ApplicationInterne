-- Extension multi pop-up : 3 lieux, effectifs typés (manager/employé/alternant),
-- congés, calendrier d'alternance, notifications in-app.

create table if not exists public.pop_ups (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  couleur text not null default '#6366F1',
  actif boolean not null default true
);

insert into public.pop_ups (nom, couleur)
select nom, couleur from (
  values ('Pop-up 1', '#6366F1'), ('Pop-up 2', '#F97316'), ('Pop-up 3', '#10B981')
) as v(nom, couleur)
where not exists (select 1 from public.pop_ups);

alter table public.profiles
  add column if not exists type_contrat text not null default 'employe'
    check (type_contrat in ('manager', 'employe', 'alternant'));

-- regles_horaires_ouverture devient spécifique à un pop-up
alter table public.regles_horaires_ouverture
  add column if not exists pop_up_id uuid references public.pop_ups (id) on delete cascade;

update public.regles_horaires_ouverture
set pop_up_id = (select id from public.pop_ups order by nom limit 1)
where pop_up_id is null;

alter table public.regles_horaires_ouverture
  alter column pop_up_id set not null;

alter table public.regles_horaires_ouverture
  drop constraint if exists regles_horaires_ouverture_jour_semaine_key;

alter table public.regles_horaires_ouverture
  add constraint regles_horaires_ouverture_pop_up_jour_key unique (pop_up_id, jour_semaine);

-- regles_effectifs_creneau devient spécifique à un pop-up, avec effectifs par type
alter table public.regles_effectifs_creneau
  add column if not exists pop_up_id uuid references public.pop_ups (id) on delete cascade;

update public.regles_effectifs_creneau
set pop_up_id = (select id from public.pop_ups order by nom limit 1)
where pop_up_id is null;

alter table public.regles_effectifs_creneau
  alter column pop_up_id set not null;

alter table public.regles_effectifs_creneau
  add column if not exists nb_managers_requis int not null default 0 check (nb_managers_requis >= 0),
  add column if not exists nb_employes_requis int not null default 0 check (nb_employes_requis >= 0),
  add column if not exists nb_alternants_requis int not null default 0 check (nb_alternants_requis >= 0);

update public.regles_effectifs_creneau
set nb_employes_requis = nb_personnes_requises
where nb_employes_requis = 0 and nb_personnes_requises > 0;

alter table public.regles_effectifs_creneau
  drop column if exists nb_personnes_requises;

alter table public.regles_effectifs_creneau
  drop constraint if exists regles_effectifs_creneau_jour_semaine_heure_debut_heure_fin_key;

alter table public.regles_effectifs_creneau
  add constraint regles_effectifs_creneau_pop_up_jour_creneau_key
    unique (pop_up_id, jour_semaine, heure_debut, heure_fin);

-- planning_shifts devient spécifique à un pop-up, statut étendu
alter table public.planning_shifts
  add column if not exists pop_up_id uuid references public.pop_ups (id) on delete cascade;

update public.planning_shifts
set pop_up_id = (select id from public.pop_ups order by nom limit 1)
where pop_up_id is null;

alter table public.planning_shifts
  alter column pop_up_id set not null;

alter table public.planning_shifts
  drop constraint if exists planning_shifts_statut_check;

alter table public.planning_shifts
  add constraint planning_shifts_statut_check check (statut in ('brouillon', 'valide', 'publie'));

create index if not exists planning_shifts_popup_date_idx on public.planning_shifts (pop_up_id, date);

-- Congés / indisponibilités ponctuelles
create table if not exists public.conges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date_debut date not null,
  date_fin date not null,
  type text not null default 'conge' check (type in ('conge', 'indisponibilite')),
  note text,
  created_at timestamptz not null default now(),
  constraint conge_fin_apres_debut check (date_fin >= date_debut)
);
create index if not exists conges_profile_dates_idx on public.conges (profile_id, date_debut, date_fin);

-- Calendrier d'alternance : jours d'école saisis date par date
create table if not exists public.jours_ecole_alternant (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (profile_id, date)
);
create index if not exists jours_ecole_profile_date_idx on public.jours_ecole_alternant (profile_id, date);

-- Notifications in-app
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  titre text not null,
  corps text not null default '',
  lu boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_lu_idx on public.notifications (profile_id, lu);
