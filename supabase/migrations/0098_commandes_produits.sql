-- Cf. retour utilisateur du 2026-09-05 : "aujourd'hui ya que les pin's qui sont envoyé dans une
-- commande pas les produiits et pas les consommables" — les Produits (chaussures/coques/sacs)
-- n'avaient aucun circuit de demande de stock pop-up -> local (contrairement aux pin's, migration
-- 0037, et aux consommables, migration 0043). Même circuit à 3 états (demandee/envoyee/recue),
-- avec quantité par ligne cette fois (contrairement aux consommables) — cf. retour utilisateur :
-- "normalement ya la quantité deja dans a commander les chaussures" (calculerARamener, déjà
-- calculé côté client, cf. src/utils/chaussures.ts/coques.ts/sacs.ts).
--
-- `categorie` + `produit_id` pointent vers l'une des 3 tables stock existantes selon la catégorie
-- (chaussures_stock/coques_stock/sacs_stock) — pas de contrainte FK unique possible vers 3 tables
-- différentes, vérifié côté application. `libelle` dénormalise la description de la variante au
-- moment de la demande (ex. "Noir 40-41"), pour ne pas avoir à rejoindre 3 tables différentes
-- juste pour afficher l'écran de préparation du local.
create table public.commandes_produits (
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
create index commandes_produits_popup_idx on public.commandes_produits (pop_up_id, created_at desc);
create index commandes_produits_statut_idx on public.commandes_produits (statut);

-- Une seule commande "en vol" (pas encore reçue) à la fois par pop-up, même contrainte que pin's/consommables.
create unique index commandes_produits_une_active_idx
  on public.commandes_produits (pop_up_id) where statut <> 'recue';

create table public.commande_produits_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes_produits (id) on delete cascade,
  categorie text not null check (categorie in ('chaussures', 'coques', 'sacs')),
  produit_id uuid not null,
  libelle text not null,
  quantite integer not null default 0,
  fait boolean not null default false,
  created_at timestamptz not null default now()
);
create index commande_produits_lignes_commande_idx on public.commande_produits_lignes (commande_id);

alter table public.commandes_produits enable row level security;
alter table public.commande_produits_lignes enable row level security;

create policy "commandes_produits_lecture" on public.commandes_produits
  for select using ((select auth.uid()) is not null);

create policy "commandes_produits_ecriture" on public.commandes_produits
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = (select auth.uid()) and pop_up_id = commandes_produits.pop_up_id
    )
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = (select auth.uid()) and pu.est_local = true
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = (select auth.uid()) and pop_up_id = commandes_produits.pop_up_id
    )
    or exists (
      select 1 from public.profil_pop_ups ppu
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where ppu.profile_id = (select auth.uid()) and pu.est_local = true
    )
  );

create policy "commande_produits_lignes_lecture" on public.commande_produits_lignes
  for select using ((select auth.uid()) is not null);

create policy "commande_produits_lignes_ecriture" on public.commande_produits_lignes
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.commandes_produits cp
      join public.profil_pop_ups ppu on ppu.pop_up_id = cp.pop_up_id
      where cp.id = commande_produits_lignes.commande_id
        and ppu.profile_id = (select auth.uid())
        and cp.statut = 'demandee'
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.commandes_produits cp
      join public.profil_pop_ups ppu on ppu.pop_up_id = cp.pop_up_id
      where cp.id = commande_produits_lignes.commande_id
        and ppu.profile_id = (select auth.uid())
        and cp.statut = 'demandee'
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.commandes_produits;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.commande_produits_lignes;
exception when duplicate_object then null;
end $$;
