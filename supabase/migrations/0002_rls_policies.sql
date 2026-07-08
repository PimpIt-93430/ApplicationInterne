-- Row Level Security : un employé ne voit/modifie que ses propres données,
-- l'admin a accès à tout.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Empêche un employé de s'auto-promouvoir admin ou de modifier ses champs
-- réservés à l'admin, même si la policy d'update le laisse modifier sa ligne.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.actif := old.actif;
    new.heures_max_semaine := old.heures_max_semaine;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_profile_update on public.profiles;
create trigger before_profile_update
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

alter table public.profiles enable row level security;
alter table public.disponibilites enable row level security;
alter table public.regles_horaires_ouverture enable row level security;
alter table public.regles_effectifs_creneau enable row level security;
alter table public.regles_globales enable row level security;
alter table public.planning_shifts enable row level security;

-- profiles
drop policy if exists "profils_lecture" on public.profiles;
create policy "profils_lecture" on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists "profils_maj" on public.profiles;
create policy "profils_maj" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profils_suppression_admin" on public.profiles;
create policy "profils_suppression_admin" on public.profiles
  for delete using (public.is_admin());

-- disponibilites
drop policy if exists "dispo_lecture" on public.disponibilites;
create policy "dispo_lecture" on public.disponibilites
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "dispo_ecriture" on public.disponibilites;
create policy "dispo_ecriture" on public.disponibilites
  for insert with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "dispo_maj" on public.disponibilites;
create policy "dispo_maj" on public.disponibilites
  for update using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "dispo_suppression" on public.disponibilites;
create policy "dispo_suppression" on public.disponibilites
  for delete using (profile_id = auth.uid() or public.is_admin());

-- règles métier : lecture pour tous les utilisateurs connectés, écriture admin only
drop policy if exists "regles_ouverture_lecture" on public.regles_horaires_ouverture;
create policy "regles_ouverture_lecture" on public.regles_horaires_ouverture
  for select using (auth.uid() is not null);
drop policy if exists "regles_ouverture_ecriture" on public.regles_horaires_ouverture;
create policy "regles_ouverture_ecriture" on public.regles_horaires_ouverture
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "regles_effectifs_lecture" on public.regles_effectifs_creneau;
create policy "regles_effectifs_lecture" on public.regles_effectifs_creneau
  for select using (auth.uid() is not null);
drop policy if exists "regles_effectifs_ecriture" on public.regles_effectifs_creneau;
create policy "regles_effectifs_ecriture" on public.regles_effectifs_creneau
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "regles_globales_lecture" on public.regles_globales;
create policy "regles_globales_lecture" on public.regles_globales
  for select using (auth.uid() is not null);
drop policy if exists "regles_globales_ecriture" on public.regles_globales;
create policy "regles_globales_ecriture" on public.regles_globales
  for all using (public.is_admin()) with check (public.is_admin());

-- planning_shifts : un employé ne voit que ses shifts publiés, l'admin gère tout
drop policy if exists "shifts_lecture" on public.planning_shifts;
create policy "shifts_lecture" on public.planning_shifts
  for select using (
    (profile_id = auth.uid() and statut = 'publie') or public.is_admin()
  );

drop policy if exists "shifts_ecriture_admin" on public.planning_shifts;
create policy "shifts_ecriture_admin" on public.planning_shifts
  for all using (public.is_admin()) with check (public.is_admin());

-- Realtime sur les tables consultées en direct par l'app
do $$
begin
  alter publication supabase_realtime add table public.disponibilites;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.planning_shifts;
exception when duplicate_object then null;
end $$;
