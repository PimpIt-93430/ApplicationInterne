-- La policy d'écriture de commande_produits_lignes (migration 0098) n'autorisait que l'admin ou un
-- membre du pop-up DEMANDEUR à cocher "fait" sur une ligne — jamais un membre du local, qui doit
-- pourtant pouvoir cocher chaque produit au fil de la préparation (même besoin que pour
-- commandes_produits elle-même, qui a déjà cette clause local). Sans ça, l'écran de préparation
-- (Local > Voir les commandes) serait bloqué par RLS pour quiconque n'est pas admin.
drop policy "commande_produits_lignes_ecriture" on public.commande_produits_lignes;

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
    or exists (
      select 1 from public.commandes_produits cp
      join public.profil_pop_ups ppu on ppu.pop_up_id = cp.pop_up_id
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where cp.id = commande_produits_lignes.commande_id
        and ppu.profile_id = (select auth.uid())
        and pu.est_local = true
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
    or exists (
      select 1 from public.commandes_produits cp
      join public.profil_pop_ups ppu on ppu.pop_up_id = cp.pop_up_id
      join public.pop_ups pu on pu.id = ppu.pop_up_id
      where cp.id = commande_produits_lignes.commande_id
        and ppu.profile_id = (select auth.uid())
        and pu.est_local = true
        and cp.statut = 'demandee'
    )
  );
