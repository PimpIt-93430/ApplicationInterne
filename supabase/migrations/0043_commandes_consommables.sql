-- Commande de consommables (pochons, sacs, scotch, enveloppes, sac poubelle, autre) — même
-- circuit à 3 états que les commandes de pin's (migration 0037), noms adaptés : le pop-up coche ce
-- dont il a besoin ("demandee"), le local marque "envoyee" une fois préparé/envoyé, le pop-up
-- confirme "recue". Pas d'étape de pesée/préparation détaillée pin par pin ici, contrairement aux
-- pin's — juste une liste de types cochés, avec une case "autre" à description libre.

create table if not exists public.commandes_consommables (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  statut text not null default 'demandee' check (statut in ('demandee', 'envoyee', 'recue')),
  demandee_par uuid references public.profiles (id),
  demandee_at timestamptz not null default now(),
  envoyee_par uuid references public.profiles (id),
  envoyee_at timestamptz,
  recue_par uuid references public.profiles (id),
  recue_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists commandes_consommables_popup_idx
  on public.commandes_consommables (pop_up_id, created_at desc);
create index if not exists commandes_consommables_statut_idx on public.commandes_consommables (statut);

-- Une seule commande "en vol" (pas encore reçue) à la fois par pop-up, même contrainte que pour
-- les pin's (migration 0037).
create unique index if not exists commandes_consommables_une_active_idx
  on public.commandes_consommables (pop_up_id) where statut <> 'recue';

create table if not exists public.commande_consommables_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes_consommables (id) on delete cascade,
  type text not null check (
    type in ('pochon', 'sac_chaussures', 'scotch_double_face', 'enveloppes', 'sac_poubelle', 'autre')
  ),
  -- Description libre : renseignée pour "autre" (quoi exactement), optionnelle sinon.
  description text,
  created_at timestamptz not null default now()
);
create index if not exists commande_consommables_lignes_commande_idx
  on public.commande_consommables_lignes (commande_id);

alter table public.commandes_consommables enable row level security;
alter table public.commande_consommables_lignes enable row level security;

drop policy if exists "commandes_consommables_lecture" on public.commandes_consommables;
create policy "commandes_consommables_lecture" on public.commandes_consommables
  for select using (auth.uid() is not null);

-- Écriture : l'admin, le pop-up concerné (crée sa demande, confirme la réception) ou le local
-- (marque "envoyée") — une seule policy pour les trois cas, l'UI ne propose que la transition
-- pertinente selon le statut courant et le rôle de la personne connectée.
drop policy if exists "commandes_consommables_ecriture" on public.commandes_consommables;
create policy "commandes_consommables_ecriture" on public.commandes_consommables
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = auth.uid() and pop_up_id = commandes_consommables.pop_up_id
    )
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = auth.uid() and pu.est_local = true
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = auth.uid() and pop_up_id = commandes_consommables.pop_up_id
    )
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = auth.uid() and pu.est_local = true
    )
  );

drop policy if exists "commande_consommables_lignes_lecture" on public.commande_consommables_lignes;
create policy "commande_consommables_lignes_lecture" on public.commande_consommables_lignes
  for select using (auth.uid() is not null);

-- Ajout/retrait de lignes : le pop-up propriétaire de la commande (tant qu'elle est encore
-- "demandee", avant que le local commence à la traiter) ou l'admin.
drop policy if exists "commande_consommables_lignes_ecriture" on public.commande_consommables_lignes;
create policy "commande_consommables_lignes_ecriture" on public.commande_consommables_lignes
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.commandes_consommables cc
      join public.profil_pop_ups ppu on ppu.pop_up_id = cc.pop_up_id
      where cc.id = commande_consommables_lignes.commande_id
        and ppu.profile_id = auth.uid()
        and cc.statut = 'demandee'
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.commandes_consommables cc
      join public.profil_pop_ups ppu on ppu.pop_up_id = cc.pop_up_id
      where cc.id = commande_consommables_lignes.commande_id
        and ppu.profile_id = auth.uid()
        and cc.statut = 'demandee'
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.commandes_consommables;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.commande_consommables_lignes;
exception when duplicate_object then null;
end $$;
