-- Ajoute un 4e type à "conges" : "repos" (jour de repos décidé par l'admin/manager pour la
-- personne, ex. via le panneau "Nouvelle absence" du calendrier web) — distinct d'une
-- "indisponibilite" (déclarée par la personne elle-même) même si les deux bloquent pareillement la
-- génération auto du planning (cf. estEnConge, aucun changement nécessaire côté code : tout type
-- différent de "conge" bloque déjà). Toujours supprimable immédiatement, comme une indisponibilité
-- (pas de verrouillage a posteriori comme pour "absence", cf. migration 0046 — ce n'est pas un
-- constat d'absence, juste un jour off planifié à l'avance).
alter table public.conges drop constraint if exists conges_type_check;
alter table public.conges
  add constraint conges_type_check check (type in ('conge', 'indisponibilite', 'absence', 'repos'));

drop policy if exists "conges_suppression" on public.conges;
create policy "conges_suppression" on public.conges
  for delete using (
    (
      profile_id = auth.uid()
      and (
        type in ('indisponibilite', 'repos')
        or (type = 'absence' and date_fin >= current_date)
        or statut = 'en_attente'
      )
    )
    or public.is_admin()
    or public.a_droit_sur_profil('calendrier', profile_id)
  );
