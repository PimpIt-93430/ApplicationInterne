-- Retour utilisateur du 2026-11-03 : les managers doivent pouvoir changer les calendriers d'école
-- aussi — en plus de la modification directe (0129), ils voient et valident/refusent les demandes
-- des alternants de leur(s) pop-up(s) (est_manager_de_alternant), comme l'admin.

drop policy if exists demandes_calendrier_ecole_lecture on public.demandes_calendrier_ecole;
create policy demandes_calendrier_ecole_lecture on public.demandes_calendrier_ecole
  for select using (profile_id = auth.uid() or is_admin() or est_manager_de_alternant(profile_id));

drop policy if exists demandes_calendrier_ecole_maj_admin on public.demandes_calendrier_ecole;
create policy demandes_calendrier_ecole_maj_admin on public.demandes_calendrier_ecole
  for update using (is_admin() or est_manager_de_alternant(profile_id))
  with check (is_admin() or est_manager_de_alternant(profile_id));

drop policy if exists demandes_calendrier_ecole_jours_lecture on public.demandes_calendrier_ecole_jours;
create policy demandes_calendrier_ecole_jours_lecture on public.demandes_calendrier_ecole_jours
  for select using (
    exists (
      select 1 from public.demandes_calendrier_ecole d
      where d.id = demandes_calendrier_ecole_jours.demande_id
        and (d.profile_id = auth.uid() or is_admin() or est_manager_de_alternant(d.profile_id))
    )
  );
