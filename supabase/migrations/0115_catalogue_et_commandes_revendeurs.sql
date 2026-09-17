-- Reconstruction de l'ancienne page "Espace Revendeur" (gestionpimpit-production.up.railway.app/b2b.html)
-- sur le Hub (app/revendeurs), retour utilisateur du 2026-09-17. prix_revente_ht existe déjà sur
-- stock_pins (636/706 pins déjà tarifés, confirmé identique à l'ancienne page) — pas de nouvelle
-- colonne de prix nécessaire, seulement une vue publique restreinte + les tables de commande.

-- Vue publique (anon) : uniquement les colonnes nécessaires à l'affichage, jamais stock_general/
-- prix_fournisseur/emplacement (données internes) — et seulement les pins actifs déjà tarifés côté
-- revendeur (un pin sans prix ne doit jamais apparaître à 0€).
create or replace view catalogue_revendeurs as
select
  airtable_record_id as id,
  nom as name,
  photo_url as photo,
  sku_pimpit as sku_fournisseur,
  prix_revente_ht as price_ht
from stock_pins
where actif = true and prix_revente_ht is not null and airtable_record_id is not null;

grant select on catalogue_revendeurs to anon, authenticated;

create table commandes_revendeurs (
  id uuid primary key default gen_random_uuid(),
  entreprise text not null,
  statut text not null default 'nouvelle' check (statut in ('nouvelle', 'traitee')),
  total_ht numeric not null default 0,
  created_at timestamptz not null default now()
);

create table commandes_revendeurs_lignes (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes_revendeurs(id) on delete cascade,
  airtable_record_id text,
  nom text not null,
  sku_fournisseur text,
  prix_unitaire_ht numeric not null,
  quantite integer not null check (quantite > 0),
  created_at timestamptz not null default now()
);

alter table commandes_revendeurs enable row level security;
alter table commandes_revendeurs_lignes enable row level security;

-- Un revendeur (anon, page publique) peut créer une commande et ses lignes, jamais les lire/modifier
-- (pas d'espace "mes commandes" pour l'instant, comme l'ancienne page).
create policy commandes_revendeurs_insert_public on commandes_revendeurs
  for insert to anon with check (true);
create policy commandes_revendeurs_lignes_insert_public on commandes_revendeurs_lignes
  for insert to anon with check (true);

-- Le staff du Hub (n'importe quel compte connecté, cf. convention déjà appliquée cette session aux
-- autres tables opérationnelles) peut tout lire et faire passer une commande à "traitée".
create policy commandes_revendeurs_lecture_staff on commandes_revendeurs
  for select to authenticated using (auth.uid() is not null);
create policy commandes_revendeurs_maj_staff on commandes_revendeurs
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy commandes_revendeurs_lignes_lecture_staff on commandes_revendeurs_lignes
  for select to authenticated using (auth.uid() is not null);
