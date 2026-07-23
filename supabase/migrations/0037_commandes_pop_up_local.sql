-- Circuit de commande formalisé entre un pop-up et le local : avant, "Valider la commande reçue"
-- clôturait tout de suite (la personne allait chercher elle-même au local). Désormais la commande
-- passe par 3 états : envoyée (par le pop-up) → prête (préparée/pesée par le local) → reçue (par
-- le pop-up, une fois récupérée). Une seule commande "en vol" (pas encore reçue) à la fois par
-- pop-up, pour ne jamais avoir deux lots en préparation en parallèle sur les mêmes pins.

create table if not exists public.commandes_pop_up (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  statut text not null default 'envoyee' check (statut in ('envoyee', 'prete', 'recue')),
  envoyee_par uuid references public.profiles (id),
  envoyee_at timestamptz not null default now(),
  preparee_par uuid references public.profiles (id),
  preparee_at timestamptz,
  recue_par uuid references public.profiles (id),
  recue_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists commandes_pop_up_popup_idx on public.commandes_pop_up (pop_up_id, created_at desc);
create index if not exists commandes_pop_up_statut_idx on public.commandes_pop_up (statut);

create unique index if not exists commandes_pop_up_une_active_idx
  on public.commandes_pop_up (pop_up_id) where statut <> 'recue';

create table if not exists public.commande_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes_pop_up (id) on delete cascade,
  pin_id uuid not null references public.stock_pins (id) on delete cascade,
  fait boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists commande_lignes_commande_idx on public.commande_lignes (commande_id);

alter table public.commandes_pop_up enable row level security;
alter table public.commande_lignes enable row level security;

drop policy if exists "commandes_pop_up_lecture" on public.commandes_pop_up;
create policy "commandes_pop_up_lecture" on public.commandes_pop_up
  for select using (auth.uid() is not null);

-- Écriture : l'admin, le pop-up concerné (envoie sa commande, marque "reçue") ou le local (marque
-- "prête" une fois préparée) — une seule policy pour les deux rôles, l'app ne propose dans l'UI
-- que la transition pertinente selon le statut courant.
drop policy if exists "commandes_pop_up_ecriture" on public.commandes_pop_up;
create policy "commandes_pop_up_ecriture" on public.commandes_pop_up
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = auth.uid() and pop_up_id = commandes_pop_up.pop_up_id
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
      where profile_id = auth.uid() and pop_up_id = commandes_pop_up.pop_up_id
    )
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = auth.uid() and pu.est_local = true
    )
  );

drop policy if exists "commande_lignes_lecture" on public.commande_lignes;
create policy "commande_lignes_lecture" on public.commande_lignes
  for select using (auth.uid() is not null);

-- Cocher "fait" (pesée effectuée pour ce pin) est réservé au local qui prépare, même règle que
-- l'onglet Local existant (admin ou attribué au pop-up marqué est_local).
drop policy if exists "commande_lignes_ecriture" on public.commande_lignes;
create policy "commande_lignes_ecriture" on public.commande_lignes
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = auth.uid() and pu.est_local = true
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = auth.uid() and pu.est_local = true
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.commandes_pop_up;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.commande_lignes;
exception when duplicate_object then null;
end $$;

-- L'historique (qui alimente l'ajustement auto du seuil, migration 0029) est maintenant écrit par
-- le local au moment où il valide la commande "prête" (coche par pin : préparé/trouvé ou pas),
-- plus par un admin au pop-up qui validait la réception à l'ancienne.
drop policy if exists "commandes_historique_insertion" on public.commandes_historique;
create policy "commandes_historique_insertion" on public.commandes_historique
  for insert with check (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = auth.uid() and pu.est_local = true
    )
  );
