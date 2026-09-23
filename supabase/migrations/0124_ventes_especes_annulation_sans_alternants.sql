-- Un alternant peut déclarer des espèces (cf. 0123) mais pas annuler une vente : l'annulation
-- reste réservée aux managers/employés du pop-up et aux admins.
drop policy if exists "ventes_especes_annulation" on public.ventes_especes;
create policy "ventes_especes_annulation" on public.ventes_especes
  for update using (
    public.is_admin()
    or (
      exists (
        select 1 from public.profil_pop_ups pp
        where pp.profile_id = auth.uid() and pp.pop_up_id = ventes_especes.pop_up_id
      )
      and coalesce((select pr.type_contrat from public.profiles pr where pr.id = auth.uid()), '') <> 'alternant'
    )
  )
  with check (true);
