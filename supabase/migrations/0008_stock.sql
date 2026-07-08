-- Stock des pin's : catalogue général + casiers par pop-up (grille A1-G3, 2 casiers par pin)
-- + historique des mouvements (réception/ajustement stock général, remplissage de casier).

create table if not exists public.stock_pins (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  sku_pimpit text,
  sku_fournisseur text,
  fournisseur text,
  photo_url text,
  description text,
  poids_unitaire numeric,
  poids_total numeric,
  stock_general numeric not null default 0,
  seuil_cible numeric,
  prix_revente_ht numeric,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stock_pins_nom_idx on public.stock_pins (nom);

create table if not exists public.pop_up_pin_boites (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  pin_id uuid not null references public.stock_pins (id) on delete cascade,
  case_position text not null check (case_position ~ '^[A-G][1-3]$'),
  numero_case smallint not null check (numero_case in (1, 2)),
  niveau_remplissage numeric check (niveau_remplissage between 0 and 100),
  maj_par uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (pop_up_id, case_position),
  unique (pop_up_id, pin_id, numero_case)
);
create index if not exists pop_up_pin_boites_popup_idx on public.pop_up_pin_boites (pop_up_id);
create index if not exists pop_up_pin_boites_pin_idx on public.pop_up_pin_boites (pin_id);

create table if not exists public.stock_mouvements (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.stock_pins (id) on delete cascade,
  pop_up_id uuid references public.pop_ups (id) on delete set null,
  type text not null check (type in ('reception', 'ajustement', 'remplissage')),
  quantite_delta numeric,
  niveau_remplissage numeric,
  case_position text,
  numero_case smallint,
  note text,
  profile_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists stock_mouvements_pin_idx on public.stock_mouvements (pin_id, created_at desc);
create index if not exists stock_mouvements_popup_idx on public.stock_mouvements (pop_up_id, created_at desc);

-- Row Level Security

alter table public.stock_pins enable row level security;
alter table public.pop_up_pin_boites enable row level security;
alter table public.stock_mouvements enable row level security;

-- stock_pins : catalogue lisible par tous, écriture admin uniquement (créé/édité côté entrepôt)
drop policy if exists "stock_pins_lecture" on public.stock_pins;
create policy "stock_pins_lecture" on public.stock_pins
  for select using (auth.uid() is not null);

drop policy if exists "stock_pins_ecriture_admin" on public.stock_pins;
create policy "stock_pins_ecriture_admin" on public.stock_pins
  for all using (public.is_admin()) with check (public.is_admin());

-- pop_up_pin_boites : lecture pour tous, écriture par l'admin ou un profil rattaché à ce pop-up
drop policy if exists "boites_lecture" on public.pop_up_pin_boites;
create policy "boites_lecture" on public.pop_up_pin_boites
  for select using (auth.uid() is not null);

drop policy if exists "boites_ecriture" on public.pop_up_pin_boites;
create policy "boites_ecriture" on public.pop_up_pin_boites
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and pop_up_id = pop_up_pin_boites.pop_up_id
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and pop_up_id = pop_up_pin_boites.pop_up_id
    )
  );

-- stock_mouvements : lecture pour tous, insertion par l'admin ou un profil rattaché au pop-up concerné
-- (mouvements sans pop-up, ex. réception entrepôt : admin uniquement). Historique append-only : pas d'update/delete.
drop policy if exists "mouvements_lecture" on public.stock_mouvements;
create policy "mouvements_lecture" on public.stock_mouvements
  for select using (auth.uid() is not null);

drop policy if exists "mouvements_insertion" on public.stock_mouvements;
create policy "mouvements_insertion" on public.stock_mouvements
  for insert with check (
    public.is_admin()
    or (
      pop_up_id is not null
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and pop_up_id = stock_mouvements.pop_up_id
      )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.pop_up_pin_boites;
exception when duplicate_object then null;
end $$;
