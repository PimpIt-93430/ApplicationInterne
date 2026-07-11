-- Suppression de l'étape de publication manuelle : le planning généré (ou modifié à la main)
-- doit être visible immédiatement par l'équipe, sans qu'un admin ait besoin d'appuyer sur
-- "Publier". La policy limitait la lecture d'un employé à ses seuls créneaux au statut 'publie' :
-- on l'élargit à tous ses créneaux, quel que soit le statut.
drop policy if exists "shifts_lecture" on public.planning_shifts;
create policy "shifts_lecture" on public.planning_shifts
  for select using (
    profile_id = auth.uid() or public.is_admin()
  );
