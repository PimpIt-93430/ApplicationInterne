-- La policy d'insertion de la 0048 exigeait `profile_id = auth.uid()`, ce qui bloquait
-- silencieusement un admin en train de prévisualiser un manager (son auth.uid() réel reste le
-- sien, pas celui du profil prévisualisé) — même correctif que conges_ecriture (migrations
-- 0004/0034) : ajout du bypass `public.is_admin()`.
drop policy if exists "ventes_especes_ecriture" on public.ventes_especes;
create policy "ventes_especes_ecriture" on public.ventes_especes
  for insert with check (
    public.is_admin()
    or (
      profile_id = auth.uid()
      and exists (
        select 1 from public.profil_pop_ups pp
        where pp.profile_id = auth.uid() and pp.pop_up_id = ventes_especes.pop_up_id
      )
    )
  );
