-- Remplace le comptage par pesée/estimation % par une décision manuelle simple pin par pin : "le
-- sac a moins de 20 pins" → on coche "à commander" pour cette case précise. poids_pese /
-- quantite_restante / pourcentage_restant restent en base (pas de perte de données) mais ne sont
-- plus écrits par l'app — migration additive uniquement.
alter table public.pop_up_pin_boites
  add column if not exists a_commander boolean not null default false;

-- Traçabilité "qui a rempli quelle boîte, quand" : la validation du remplissage est une action
-- distincte du flag "à commander" (on peut commander un pin en plein rush sans avoir fait un
-- remplissage complet de la boîte, et inversement valider un remplissage sans rien commander).
create table if not exists public.pop_up_boite_remplissages (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  case_position text not null check (case_position ~ '^[A-G][1-3]$'),
  profile_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists pop_up_boite_remplissages_popup_idx
  on public.pop_up_boite_remplissages (pop_up_id, case_position, created_at desc);

alter table public.pop_up_boite_remplissages enable row level security;

drop policy if exists "remplissages_lecture" on public.pop_up_boite_remplissages;
create policy "remplissages_lecture" on public.pop_up_boite_remplissages
  for select using (auth.uid() is not null);

-- Même règle que l'écriture sur pop_up_pin_boites (migration 0015) : admin ou profil attribué à
-- ce pop-up via profil_pop_ups (affectations multi-lieux).
drop policy if exists "remplissages_insertion" on public.pop_up_boite_remplissages;
create policy "remplissages_insertion" on public.pop_up_boite_remplissages
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = auth.uid() and pop_up_id = pop_up_boite_remplissages.pop_up_id
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.pop_up_boite_remplissages;
exception when duplicate_object then null;
end $$;
