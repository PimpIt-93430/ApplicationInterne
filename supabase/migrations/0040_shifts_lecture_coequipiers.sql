-- Un employé (pas seulement un manager avec le droit "calendrier") doit pouvoir voir les shifts de
-- ses coéquipiers sur un lieu où il est lui-même attribué (onglet "Équipe(s)" du Planning mobile,
-- façon Combo) — jusqu'ici un employé ne voyait que ses propres shifts (migration 0034 : "un
-- employé ne voit que ses shifts... l'admin gère tout"). Politique additive : s'OR avec
-- "shifts_lecture" existante, ne la remplace pas.
drop policy if exists "shifts_lecture_coequipiers" on public.planning_shifts;
create policy "shifts_lecture_coequipiers" on public.planning_shifts
  for select using (
    exists (
      select 1 from public.profil_pop_ups pp
      where pp.profile_id = auth.uid() and pp.pop_up_id = planning_shifts.pop_up_id
    )
  );
