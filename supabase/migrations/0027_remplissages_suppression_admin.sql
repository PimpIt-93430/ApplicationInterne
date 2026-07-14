-- Un remplissage peut être ajouté par erreur (mauvaise boîte, appui accidentel) — seuls les
-- admins peuvent le supprimer du rapport, contrairement à l'insertion (ouverte à qui est
-- rattaché au pop-up, migration 0026) : c'est un log d'accountability, sa correction reste
-- verrouillée.
drop policy if exists "remplissages_suppression" on public.pop_up_boite_remplissages;
create policy "remplissages_suppression" on public.pop_up_boite_remplissages
  for delete using (public.is_admin());
