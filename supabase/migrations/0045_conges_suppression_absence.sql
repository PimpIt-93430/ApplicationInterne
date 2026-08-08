-- Une "absence" (maladie/autre, migration 0044) doit rester supprimable par son auteur sans
-- condition, comme une "indisponibilite" — ce n'est pas une demande soumise à validation (statut
-- reste "validee" par défaut) donc la restriction "seulement tant qu'en_attente" (migration 0041,
-- pensée pour "conge") ne doit pas s'y appliquer.
drop policy if exists "conges_suppression" on public.conges;
create policy "conges_suppression" on public.conges
  for delete using (
    (profile_id = auth.uid() and (type in ('indisponibilite', 'absence') or statut = 'en_attente'))
    or public.is_admin()
    or public.a_droit_sur_profil('calendrier', profile_id)
  );
