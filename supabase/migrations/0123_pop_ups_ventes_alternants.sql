-- Onglet "Ventes" (déclaration d'espèces + chiffres du jour) ouvert aux alternants, pop-up par
-- pop-up : case à cocher dans Hub > Pop-up. Désactivé par défaut — un alternant ne voit l'onglet
-- que s'il est attribué à au moins un pop-up où la case est cochée.
alter table public.pop_ups
  add column if not exists ventes_alternants boolean not null default false;

-- La RLS d'insertion (0048/0049) laissait déjà n'importe quelle personne attribuée au pop-up
-- déclarer une vente : on la resserre pour qu'un alternant ne puisse le faire que sur un pop-up où
-- l'admin l'a autorisé (managers/employés inchangés).
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
      and (
        coalesce((select pr.type_contrat from public.profiles pr where pr.id = auth.uid()), '') <> 'alternant'
        or exists (
          select 1 from public.pop_ups p
          where p.id = ventes_especes.pop_up_id and p.ventes_alternants
        )
      )
    )
  );
