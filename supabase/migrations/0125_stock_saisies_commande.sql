-- Cf. retour utilisateur du 2026-10-23 : refonte de l'onglet Stock en une colonne de catégories
-- (Pin's, Chaussures, Coques, Sacs, Lanières, Consommables) qui passent chacune au vert une fois
-- faites, puis "Envoyer la commande". Pour les produits, plus aucun calcul inventaire − ventes
-- SumUp : l'équipe saisit directement la quantité à commander par variante.
--
-- Une ligne par pop-up et par catégorie = le brouillon validé de la prochaine commande. Sa simple
-- présence rend la catégorie "verte" ; elle est supprimée une fois la commande correspondante
-- envoyée (cf. src/components/stock/CommandeGeneraleEcran.tsx), ce qui remet la case à faire.
-- Stocké en base (pas en mémoire sur le téléphone) pour que toute l'équipe du pop-up voie le même
-- état et qu'un collègue puisse reprendre là où l'autre s'est arrêté.
--
-- `quantites` : { "<id de la variante dans chaussures_stock/coques_stock/sacs_stock/
-- lanieres_stock>": quantité } pour les produits, { "<type de consommable>": 1 } pour les
-- consommables. Un objet vide est valide (= "rien à commander", la case passe quand même au vert).
create table public.stock_saisies_commande (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  categorie text not null check (categorie in ('chaussures', 'coques', 'sacs', 'lanieres', 'consommables')),
  quantites jsonb not null default '{}'::jsonb,
  description_autre text,
  validee_par uuid references public.profiles (id) on delete set null,
  validee_at timestamptz not null default now(),
  unique (pop_up_id, categorie)
);

alter table public.stock_saisies_commande enable row level security;

create policy "stock_saisies_commande_lecture" on public.stock_saisies_commande
  for select using ((select auth.uid()) is not null);

-- Même périmètre que commandes_produits (migration 0098) : admin, ou personne attribuée au pop-up.
create policy "stock_saisies_commande_ecriture" on public.stock_saisies_commande
  for all using (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = (select auth.uid()) and pop_up_id = stock_saisies_commande.pop_up_id
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups
      where profile_id = (select auth.uid()) and pop_up_id = stock_saisies_commande.pop_up_id
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.stock_saisies_commande;
exception when duplicate_object then null;
end $$;
