-- Schéma initial : profils, disponibilités, règles métier, planning.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nom_complet text not null default '',
  email text not null,
  role text not null default 'employe' check (role in ('admin', 'employe')),
  couleur text not null default '#6366F1',
  heures_max_semaine int,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.disponibilites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  heure_debut time not null,
  heure_fin time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint heure_fin_apres_debut check (heure_fin > heure_debut)
);
create index if not exists disponibilites_profile_date_idx on public.disponibilites (profile_id, date);

create table if not exists public.regles_horaires_ouverture (
  id uuid primary key default gen_random_uuid(),
  jour_semaine int not null check (jour_semaine between 0 and 6),
  heure_ouverture time not null,
  heure_fermeture time not null,
  actif boolean not null default true,
  unique (jour_semaine)
);

create table if not exists public.regles_effectifs_creneau (
  id uuid primary key default gen_random_uuid(),
  jour_semaine int not null check (jour_semaine between 0 and 6),
  heure_debut time not null,
  heure_fin time not null,
  nb_personnes_requises int not null default 1 check (nb_personnes_requises >= 0),
  unique (jour_semaine, heure_debut, heure_fin)
);
create index if not exists regles_effectifs_jour_idx on public.regles_effectifs_creneau (jour_semaine);

create table if not exists public.regles_globales (
  id int primary key default 1 check (id = 1),
  heures_max_semaine_defaut int not null default 35
);
insert into public.regles_globales (id, heures_max_semaine_defaut)
values (1, 35)
on conflict (id) do nothing;

create table if not exists public.planning_shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  heure_debut time not null,
  heure_fin time not null,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie')),
  genere_automatiquement boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_heure_fin_apres_debut check (heure_fin > heure_debut)
);
create index if not exists planning_shifts_profile_date_idx on public.planning_shifts (profile_id, date);
create index if not exists planning_shifts_date_statut_idx on public.planning_shifts (date, statut);

-- Crée automatiquement un profil "employe" à l'inscription d'un nouvel utilisateur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nom_complet)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nom_complet', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
