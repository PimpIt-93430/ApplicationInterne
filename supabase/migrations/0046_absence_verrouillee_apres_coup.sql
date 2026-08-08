-- Une absence redevient verrouillée une fois le jour passé : elle constate un fait (la personne a
-- effectivement été absente), pas une intention comme une indisponibilité — on ne doit plus
-- pouvoir l'effacer après coup une fois la période terminée (intégrité du suivi RH/paie). Reste
-- supprimable par son auteur tant que date_fin >= aujourd'hui (jour même ou futur, ex. déclarée en
-- avance) ; verrouillée dès que date_fin est dans le passé — l'admin/le manager gardent la main.
drop policy if exists "conges_suppression" on public.conges;
create policy "conges_suppression" on public.conges
  for delete using (
    (
      profile_id = auth.uid()
      and (
        type = 'indisponibilite'
        or (type = 'absence' and date_fin >= current_date)
        or statut = 'en_attente'
      )
    )
    or public.is_admin()
    or public.a_droit_sur_profil('calendrier', profile_id)
  );
