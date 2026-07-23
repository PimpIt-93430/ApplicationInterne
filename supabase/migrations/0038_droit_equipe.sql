-- Nouveau droit "équipe" : donne à un responsable de pop-up (non-admin) la visibilité — et
-- l'édition — sur la fiche RH des personnes de son lieu (infos générales, contrat, planification,
-- congés, documents), à l'exception des champs les plus sensibles (bancaire, médical) qui restent
-- strictement réservés à l'admin et à la personne concernée. Décision explicite (cf. discussion) :
-- IBAN/BIC et informations médicales ne sont jamais exposés au manager, même en lecture.

alter table public.droits_employe drop constraint if exists droits_employe_fonctionnalite_check;
alter table public.droits_employe
  add constraint droits_employe_fonctionnalite_check
  check (fonctionnalite in ('finance', 'calendrier', 'equipe'));

-- informations_rh : lecture et écriture additionnelles pour le droit "équipe" (s'ajoute aux
-- policies existantes self/admin, une policy permissive supplémentaire s'OR avec les autres).
drop policy if exists "informations_rh_lecture_manager" on public.informations_rh;
create policy "informations_rh_lecture_manager" on public.informations_rh
  for select using (public.a_droit_sur_profil('equipe', profile_id));

drop policy if exists "informations_rh_maj_manager" on public.informations_rh;
create policy "informations_rh_maj_manager" on public.informations_rh
  for update using (public.a_droit_sur_profil('equipe', profile_id))
  with check (public.a_droit_sur_profil('equipe', profile_id));

-- Un manager (pas admin) qui écrit sur informations_rh ne doit jamais pouvoir toucher aux champs
-- bancaires/médicaux, même via un appel direct à l'API REST (la policy RLS ci-dessus autorise la
-- ligne entière, ce trigger verrouille les colonnes sensibles) — même principe que
-- protect_profile_privileged_fields sur profiles (migration 0002).
create or replace function public.proteger_champs_sensibles_informations_rh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.nom_titulaire_compte := old.nom_titulaire_compte;
    new.iban := old.iban;
    new.bic := old.bic;
    new.numero_secu := old.numero_secu;
    new.handicap := old.handicap;
    new.type_handicap := old.type_handicap;
    new.date_derniere_visite_medicale := old.date_derniere_visite_medicale;
    new.visite_medicale_renforcee := old.visite_medicale_renforcee;
    new.prochaine_visite_medicale := old.prochaine_visite_medicale;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_informations_rh_update_proteger_sensibles on public.informations_rh;
create trigger before_informations_rh_update_proteger_sensibles
  before update on public.informations_rh
  for each row execute function public.proteger_champs_sensibles_informations_rh();

-- documents_employe : lecture/écriture additionnelles pour le droit "équipe".
drop policy if exists "documents_employe_manager" on public.documents_employe;
create policy "documents_employe_manager" on public.documents_employe
  for all using (public.a_droit_sur_profil('equipe', profile_id))
  with check (public.a_droit_sur_profil('equipe', profile_id));

-- Bucket "documents-employes" : accès additionnel pour le droit "équipe", basé sur le préfixe de
-- chemin (chaque fichier est stocké sous "<profile_id>/...", cf. api/documentsEmploye.ts).
drop policy if exists "documents_employes_manager" on storage.objects;
create policy "documents_employes_manager" on storage.objects
  for all using (
    bucket_id = 'documents-employes'
    and public.a_droit_sur_profil('equipe', ((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'documents-employes'
    and public.a_droit_sur_profil('equipe', ((storage.foldername(name))[1])::uuid)
  );

-- horaires_recurrents_profil (onglet "Planification") : écriture additionnelle pour le droit
-- "équipe" (lecture déjà ouverte à tout utilisateur connecté depuis la migration 0014).
drop policy if exists "horaires_recurrents_ecriture_manager" on public.horaires_recurrents_profil;
create policy "horaires_recurrents_ecriture_manager" on public.horaires_recurrents_profil
  for all using (public.a_droit_sur_profil('equipe', profile_id))
  with check (public.a_droit_sur_profil('equipe', profile_id));

-- profiles : un manager peut modifier la fiche d'un membre de son équipe (nom, coordonnées...) —
-- le trigger protect_profile_privileged_fields (migration 0002) verrouille déjà role/actif/
-- heures_max_semaine pour quiconque n'est pas admin, donc cette policy ne lui donne accès qu'aux
-- champs non protégés.
drop policy if exists "profils_maj_manager" on public.profiles;
create policy "profils_maj_manager" on public.profiles
  for update using (public.a_droit_sur_profil('equipe', id))
  with check (public.a_droit_sur_profil('equipe', id));

-- conges (onglet "Congés") : le droit "équipe" donne aussi accès, en plus du droit "calendrier"
-- déjà en place (migration 0034) — les deux policies s'OR, on ajoute juste celles du nouveau droit.
drop policy if exists "conges_lecture_equipe" on public.conges;
create policy "conges_lecture_equipe" on public.conges
  for select using (public.a_droit_sur_profil('equipe', profile_id));

drop policy if exists "conges_ecriture_equipe" on public.conges;
create policy "conges_ecriture_equipe" on public.conges
  for insert with check (public.a_droit_sur_profil('equipe', profile_id));

drop policy if exists "conges_maj_equipe" on public.conges;
create policy "conges_maj_equipe" on public.conges
  for update using (public.a_droit_sur_profil('equipe', profile_id))
  with check (public.a_droit_sur_profil('equipe', profile_id));

drop policy if exists "conges_suppression_equipe" on public.conges;
create policy "conges_suppression_equipe" on public.conges
  for delete using (public.a_droit_sur_profil('equipe', profile_id));
