-- Permissions granulaires : donne à un employé non-admin un accès élargi à Finance et/ou
-- Calendrier, éventuellement limité à un seul pop-up (pop_up_id null = tous les pop-ups). Le Stock
-- ne passe pas par cette table : il continue de suivre profil_pop_ups (déjà en place).
create table public.droits_employe (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  fonctionnalite text not null check (fonctionnalite in ('finance', 'calendrier')),
  pop_up_id uuid references public.pop_ups(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, fonctionnalite, pop_up_id)
);

-- NULL n'est jamais égal à NULL dans une contrainte unique standard : sans index partiel, rien
-- n'empêcherait plusieurs lignes "tous les pop-ups" pour la même personne/fonctionnalité.
create unique index droits_employe_non_scope_uniq on public.droits_employe (profile_id, fonctionnalite) where pop_up_id is null;
create index droits_employe_profile_idx on public.droits_employe (profile_id, fonctionnalite);

alter table public.droits_employe enable row level security;

drop policy if exists "droits_employe_lecture" on public.droits_employe;
create policy "droits_employe_lecture" on public.droits_employe
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "droits_employe_ecriture_admin" on public.droits_employe;
create policy "droits_employe_ecriture_admin" on public.droits_employe
  for all using (public.is_admin()) with check (public.is_admin());

-- Vérifie si l'utilisateur connecté a un droit sur une fonctionnalité pour un pop-up donné (ou un
-- droit "tous les pop-ups" via pop_up_id null) — même convention que is_admin() (0002).
create or replace function public.a_droit(p_fonctionnalite text, p_pop_up_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.droits_employe d
    where d.profile_id = auth.uid() and d.fonctionnalite = p_fonctionnalite
      and (d.pop_up_id is null or d.pop_up_id = p_pop_up_id)
  );
$$;

-- Variante pour les tables sans colonne pop_up_id propre (ex. conges, qui concerne une personne,
-- pas un lieu) : vérifie que la personne ciblée est elle-même attribuée (profil_pop_ups) à un lieu
-- couvert par mon droit.
create or replace function public.a_droit_sur_profil(p_fonctionnalite text, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.droits_employe d
    where d.profile_id = auth.uid() and d.fonctionnalite = p_fonctionnalite
      and exists (
        select 1 from public.profil_pop_ups pp
        where pp.profile_id = p_profile_id and (d.pop_up_id is null or pp.pop_up_id = d.pop_up_id)
      )
  );
$$;

-- planning_shifts : un responsable de pop-up (droit "calendrier") peut désormais lire et gérer
-- (créer/modifier/supprimer) les shifts de son/ses pop-up(s), pas seulement les admins.
drop policy if exists "shifts_lecture" on public.planning_shifts;
create policy "shifts_lecture" on public.planning_shifts
  for select using (
    profile_id = auth.uid() or public.is_admin() or public.a_droit('calendrier', pop_up_id)
  );

drop policy if exists "shifts_ecriture_admin" on public.planning_shifts;
create policy "shifts_ecriture_manager" on public.planning_shifts
  for all using (
    public.is_admin() or public.a_droit('calendrier', pop_up_id)
  ) with check (
    public.is_admin() or public.a_droit('calendrier', pop_up_id)
  );

-- conges : un responsable de pop-up doit pouvoir voir ET déclarer/supprimer une absence pour un
-- membre de son équipe (pas seulement consulter), pour vraiment gérer le planning de son lieu.
drop policy if exists "conges_lecture" on public.conges;
create policy "conges_lecture" on public.conges
  for select using (
    profile_id = auth.uid() or public.is_admin() or public.a_droit_sur_profil('calendrier', profile_id)
  );

drop policy if exists "conges_ecriture" on public.conges;
create policy "conges_ecriture" on public.conges
  for insert with check (
    profile_id = auth.uid() or public.is_admin() or public.a_droit_sur_profil('calendrier', profile_id)
  );

drop policy if exists "conges_maj" on public.conges;
create policy "conges_maj" on public.conges
  for update using (
    profile_id = auth.uid() or public.is_admin() or public.a_droit_sur_profil('calendrier', profile_id)
  ) with check (
    profile_id = auth.uid() or public.is_admin() or public.a_droit_sur_profil('calendrier', profile_id)
  );

drop policy if exists "conges_suppression" on public.conges;
create policy "conges_suppression" on public.conges
  for delete using (
    profile_id = auth.uid() or public.is_admin() or public.a_droit_sur_profil('calendrier', profile_id)
  );

-- ventes_sumup : policy additionnelle (les policies permissives s'additionnent en OR, la policy
-- admin-only existante reste intacte) — un droit finance scopé à un pop-up ne verra jamais les
-- ventes non attribuées de ce lieu (pop_up_id null), seul un droit "tous les pop-up" ou un admin
-- les voit (limite acceptée, cf. plan).
drop policy if exists "ventes_sumup_lecture_manager" on public.ventes_sumup;
create policy "ventes_sumup_lecture_manager" on public.ventes_sumup
  for select using (public.a_droit('finance', pop_up_id));
