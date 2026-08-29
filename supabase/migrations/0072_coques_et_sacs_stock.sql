-- Même architecture que les chaussures (migrations 0022/0065/0067/0068), déclinée pour les coques
-- et les sacs/pochettes : stock visé unique et partagé entre pop-ups (xxx_stock), inventaire compté
-- par pop-up avec historique complet jamais écrasé (xxx_inventaires), et correspondance nom SumUp →
-- variante gérée à la main en repli quand la description ne parse pas (xxx_mapping_sumup). Deux
-- jeux de tables séparés (pas une table générique à catégorie) : les dimensions diffèrent
-- (modèle/variante/couleur pour les coques, produit/couleur pour les sacs) et des colonnes/CHECK
-- explicites par catégorie restent plus sûrs qu'un descripteur texte opaque à faire correspondre
-- soi-même entre stock et ventes.

-- Coques : catalogue donné par l'utilisateur (2026-08-24) — 5 modèles x 4 variantes x 2 couleurs.
create table if not exists public.coques_stock (
  id uuid primary key default gen_random_uuid(),
  modele text not null check (modele in ('Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17')),
  variante text not null check (variante in ('Normal', 'Pro', 'Pro Max', 'Plus')),
  couleur text not null check (couleur in ('Rose', 'Noir')),
  stock_initial numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (modele, variante, couleur)
);

alter table public.coques_stock enable row level security;

drop policy if exists "coques_stock_lecture" on public.coques_stock;
create policy "coques_stock_lecture" on public.coques_stock
  for select using (auth.uid() is not null);

drop policy if exists "coques_stock_ecriture" on public.coques_stock;
create policy "coques_stock_ecriture" on public.coques_stock
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

insert into public.coques_stock (modele, variante, couleur)
select m.modele, v.variante, c.couleur
from unnest(array['Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17']) as m(modele)
cross join unnest(array['Normal', 'Pro', 'Pro Max', 'Plus']) as v(variante)
cross join unnest(array['Rose', 'Noir']) as c(couleur)
on conflict (modele, variante, couleur) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.coques_stock;
exception when duplicate_object then null;
end $$;

create table if not exists public.coques_inventaires (
  id uuid primary key default gen_random_uuid(),
  modele text not null check (modele in ('Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17')),
  variante text not null check (variante in ('Normal', 'Pro', 'Pro Max', 'Plus')),
  couleur text not null check (couleur in ('Rose', 'Noir')),
  quantite_comptee numeric not null check (quantite_comptee >= 0),
  profile_id uuid not null references public.profiles (id),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists coques_inventaires_popup_variante_idx
  on public.coques_inventaires (pop_up_id, modele, variante, couleur, created_at desc);

alter table public.coques_inventaires enable row level security;

drop policy if exists "coques_inventaires_lecture" on public.coques_inventaires;
create policy "coques_inventaires_lecture" on public.coques_inventaires
  for select using (auth.uid() is not null);

drop policy if exists "coques_inventaires_creation" on public.coques_inventaires;
create policy "coques_inventaires_creation" on public.coques_inventaires
  for insert with check (
    auth.uid() is not null
    and profile_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.profil_pop_ups
        where profile_id = auth.uid() and pop_up_id = coques_inventaires.pop_up_id
      )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.coques_inventaires;
exception when duplicate_object then null;
end $$;

create table if not exists public.coques_mapping_sumup (
  id uuid primary key default gen_random_uuid(),
  nom_produit text not null unique,
  modele text not null check (modele in ('Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17')),
  variante text not null check (variante in ('Normal', 'Pro', 'Pro Max', 'Plus')),
  couleur text not null check (couleur in ('Rose', 'Noir')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coques_mapping_sumup enable row level security;

drop policy if exists "coques_mapping_sumup_lecture" on public.coques_mapping_sumup;
create policy "coques_mapping_sumup_lecture" on public.coques_mapping_sumup
  for select using (auth.uid() is not null);

drop policy if exists "coques_mapping_sumup_ecriture_admin" on public.coques_mapping_sumup;
create policy "coques_mapping_sumup_ecriture_admin" on public.coques_mapping_sumup
  for all using (public.is_admin()) with check (public.is_admin());

-- Sacs/pochettes : 3 produits x 2 couleurs (liste utilisateur du 2026-08-24). "produit" plutôt que
-- "taille" : c'est le nom de l'article (Grandes/Petites Pochettes, Sac Pimp-it + 6 pin's) qui varie
-- ici, pas une taille au sens chaussures.
create table if not exists public.sacs_stock (
  id uuid primary key default gen_random_uuid(),
  produit text not null check (produit in ('Grandes Pochettes', 'Petites Pochettes', 'Sac Pimp-it + 6 pin''s')),
  couleur text not null check (couleur in ('Rose', 'Noir')),
  stock_initial numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (produit, couleur)
);

alter table public.sacs_stock enable row level security;

drop policy if exists "sacs_stock_lecture" on public.sacs_stock;
create policy "sacs_stock_lecture" on public.sacs_stock
  for select using (auth.uid() is not null);

drop policy if exists "sacs_stock_ecriture" on public.sacs_stock;
create policy "sacs_stock_ecriture" on public.sacs_stock
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

insert into public.sacs_stock (produit, couleur)
select p.produit, c.couleur
from unnest(array['Grandes Pochettes', 'Petites Pochettes', 'Sac Pimp-it + 6 pin''s']) as p(produit)
cross join unnest(array['Rose', 'Noir']) as c(couleur)
on conflict (produit, couleur) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.sacs_stock;
exception when duplicate_object then null;
end $$;

create table if not exists public.sacs_inventaires (
  id uuid primary key default gen_random_uuid(),
  produit text not null check (produit in ('Grandes Pochettes', 'Petites Pochettes', 'Sac Pimp-it + 6 pin''s')),
  couleur text not null check (couleur in ('Rose', 'Noir')),
  quantite_comptee numeric not null check (quantite_comptee >= 0),
  profile_id uuid not null references public.profiles (id),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists sacs_inventaires_popup_produit_idx
  on public.sacs_inventaires (pop_up_id, produit, couleur, created_at desc);

alter table public.sacs_inventaires enable row level security;

drop policy if exists "sacs_inventaires_lecture" on public.sacs_inventaires;
create policy "sacs_inventaires_lecture" on public.sacs_inventaires
  for select using (auth.uid() is not null);

drop policy if exists "sacs_inventaires_creation" on public.sacs_inventaires;
create policy "sacs_inventaires_creation" on public.sacs_inventaires
  for insert with check (
    auth.uid() is not null
    and profile_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.profil_pop_ups
        where profile_id = auth.uid() and pop_up_id = sacs_inventaires.pop_up_id
      )
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.sacs_inventaires;
exception when duplicate_object then null;
end $$;

create table if not exists public.sacs_mapping_sumup (
  id uuid primary key default gen_random_uuid(),
  nom_produit text not null unique,
  produit text not null check (produit in ('Grandes Pochettes', 'Petites Pochettes', 'Sac Pimp-it + 6 pin''s')),
  couleur text not null check (couleur in ('Rose', 'Noir')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sacs_mapping_sumup enable row level security;

drop policy if exists "sacs_mapping_sumup_lecture" on public.sacs_mapping_sumup;
create policy "sacs_mapping_sumup_lecture" on public.sacs_mapping_sumup
  for select using (auth.uid() is not null);

drop policy if exists "sacs_mapping_sumup_ecriture_admin" on public.sacs_mapping_sumup;
create policy "sacs_mapping_sumup_ecriture_admin" on public.sacs_mapping_sumup
  for all using (public.is_admin()) with check (public.is_admin());
