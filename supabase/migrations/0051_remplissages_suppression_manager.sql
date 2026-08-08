-- Élargit la suppression d'un remplissage (migration 0027, jusque-là réservée aux admins) aux
-- managers attribués à ce pop-up précis — même périmètre que l'insertion (migration 0026) : un
-- manager doit pouvoir corriger lui-même une erreur de saisie (mauvaise boîte, appui accidentel)
-- sur son lieu sans passer par un admin, mais pas sur un pop-up qui n'est pas le sien. Décision
-- explicite (cf. discussion), remplace la policy plutôt que d'en ajouter une : "admin uniquement"
-- devient trop restrictif.
drop policy if exists "remplissages_suppression" on public.pop_up_boite_remplissages;
create policy "remplissages_suppression" on public.pop_up_boite_remplissages
  for delete using (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      join public.profil_pop_ups pp on pp.profile_id = p.id
      where p.id = auth.uid()
        and p.type_contrat = 'manager'
        and pp.pop_up_id = pop_up_boite_remplissages.pop_up_id
    )
  );
