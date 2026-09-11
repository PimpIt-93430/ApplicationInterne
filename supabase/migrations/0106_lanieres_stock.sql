-- Onglet "Lanières" (cf. retour utilisateur : "mêmes couleurs et pointures que les chaussures,
-- faut qu'ils puissent demander des lanières dans la commande globale") — même structure que
-- chaussures_stock/chaussures_inventaires/chaussures_mapping_sumup, mêmes couleurs/tailles.

create table lanieres_stock (
  id uuid primary key default gen_random_uuid(),
  couleur text not null check (couleur = any (array['Noir','Kaki','Rose','Gris'])),
  taille text not null check (taille = any (array['36-37','38-39','40-41','41-42','43-44','45-46'])),
  stock_initial numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (couleur, taille)
);

alter table lanieres_stock enable row level security;
create policy lanieres_stock_lecture on lanieres_stock for select using (auth.uid() is not null);
create policy lanieres_stock_ecriture on lanieres_stock for all using (auth.uid() is not null) with check (auth.uid() is not null);

create table lanieres_inventaires (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references pop_ups(id) on delete cascade,
  couleur text not null check (couleur = any (array['Noir','Kaki','Rose','Gris'])),
  taille text not null check (taille = any (array['36-37','38-39','40-41','41-42','43-44','45-46'])),
  quantite_comptee numeric not null check (quantite_comptee >= 0),
  profile_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

alter table lanieres_inventaires enable row level security;
create policy lanieres_inventaires_lecture on lanieres_inventaires for select using (auth.uid() is not null);
create policy lanieres_inventaires_creation on lanieres_inventaires for insert with check (
  auth.uid() is not null and profile_id = auth.uid() and (
    is_admin() or exists (
      select 1 from profil_pop_ups
      where profil_pop_ups.profile_id = auth.uid() and profil_pop_ups.pop_up_id = lanieres_inventaires.pop_up_id
    )
  )
);

create table lanieres_mapping_sumup (
  id uuid primary key default gen_random_uuid(),
  nom_produit text not null unique,
  couleur text not null check (couleur = any (array['Noir','Kaki','Rose','Gris'])),
  taille text not null check (taille = any (array['36-37','38-39','40-41','41-42','43-44','45-46'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table lanieres_mapping_sumup enable row level security;
create policy lanieres_mapping_sumup_lecture on lanieres_mapping_sumup for select using (auth.uid() is not null);
create policy lanieres_mapping_sumup_ecriture_admin on lanieres_mapping_sumup for all using (is_admin()) with check (is_admin());

-- Seed des 24 combinaisons couleur/taille (stock cible à 0, à régler ensuite dans Stock cible).
insert into lanieres_stock (couleur, taille)
select couleur, taille
from unnest(array['Noir','Kaki','Rose','Gris']) as couleur
cross join unnest(array['36-37','38-39','40-41','41-42','43-44','45-46']) as taille;

-- Autorise la catégorie "lanieres" dans les commandes de Produits (cf. commande_produits_lignes).
alter table commande_produits_lignes drop constraint commande_produits_lignes_categorie_check;
alter table commande_produits_lignes add constraint commande_produits_lignes_categorie_check
  check (categorie = any (array['chaussures','coques','sacs','lanieres']));
