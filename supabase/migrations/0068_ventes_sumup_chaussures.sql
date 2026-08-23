-- Lie les ventes SumUp au stock chaussures : la synchro (sync-ventes-sumup) récupère déjà le
-- détail de chaque transaction (pour frais/pourboire/GPS) — ce détail contient aussi un tableau
-- "products" (nom, quantité) qu'on n'exploitait pas jusqu'ici. On le stocke ligne par ligne, puis
-- une table de correspondance (gérée à la main par un admin, pas de parsing automatique du nom —
-- plus fiable) associe chaque nom de produit SumUp à une couleur/taille chez nous. Le Réappro peut
-- alors soustraire les ventes survenues depuis le dernier inventaire, sans attendre un recomptage.

create table if not exists public.ventes_sumup_lignes (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes_sumup (id) on delete cascade,
  -- Dénormalisé depuis ventes_sumup (pop_up_id/horodatage) plutôt que de passer par une jointure :
  -- ventes_sumup est réservée aux admins (RLS "Finance", décision explicite migration 0035), alors
  -- que ces lignes doivent rester lisibles par le pop-up concerné pour calculer son réappro — pas
  -- de fuite de données financières (montants/frais/pourboires) puisqu'on ne recopie ici que ce qui
  -- est nécessaire au stock : nom de produit et quantité. pop_up_id nullable tant que la vente n'a
  -- pas encore été rattachée à un lieu (cf. passe de réattribution GPS de la synchro), tenu à jour
  -- par cette même passe quand pop_up_id change sur ventes_sumup.
  pop_up_id uuid references public.pop_ups (id) on delete set null,
  horodatage timestamptz not null,
  nom_produit text not null,
  quantite numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists ventes_sumup_lignes_vente_idx on public.ventes_sumup_lignes (vente_id);
create index if not exists ventes_sumup_lignes_popup_produit_idx
  on public.ventes_sumup_lignes (pop_up_id, nom_produit, horodatage desc);

alter table public.ventes_sumup_lignes enable row level security;

drop policy if exists "ventes_sumup_lignes_lecture" on public.ventes_sumup_lignes;
create policy "ventes_sumup_lignes_lecture" on public.ventes_sumup_lignes
  for select using (
    public.is_admin()
    or (
      pop_up_id is not null
      and exists (
        select 1 from public.profil_pop_ups
        where profile_id = auth.uid() and pop_up_id = ventes_sumup_lignes.pop_up_id
      )
    )
  );

-- Écriture : uniquement la synchro (clé service role, qui contourne RLS) — policy admin-only en
-- garde-fou, même principe que ventes_sumup.
drop policy if exists "ventes_sumup_lignes_ecriture_admin" on public.ventes_sumup_lignes;
create policy "ventes_sumup_lignes_ecriture_admin" on public.ventes_sumup_lignes
  for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.ventes_sumup_lignes;
exception when duplicate_object then null;
end $$;

create table if not exists public.chaussures_mapping_sumup (
  id uuid primary key default gen_random_uuid(),
  nom_produit text not null unique,
  couleur text not null check (couleur in ('Noir', 'Kaki', 'Rose', 'Gris')),
  taille text not null check (taille in ('36-37', '38-39', '40-41', '41-42', '43-44', '45-46')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chaussures_mapping_sumup enable row level security;

-- Lecture ouverte à tous les connectés : pas de donnée financière ici, juste "ce nom SumUp = cette
-- couleur/taille", nécessaire à quiconque affiche un réappro basé sur les ventes.
drop policy if exists "chaussures_mapping_sumup_lecture" on public.chaussures_mapping_sumup;
create policy "chaussures_mapping_sumup_lecture" on public.chaussures_mapping_sumup
  for select using (auth.uid() is not null);

drop policy if exists "chaussures_mapping_sumup_ecriture_admin" on public.chaussures_mapping_sumup;
create policy "chaussures_mapping_sumup_ecriture_admin" on public.chaussures_mapping_sumup
  for all using (public.is_admin()) with check (public.is_admin());
