-- Un manager doit avoir accès à tout comme un admin, mais uniquement pour le(s) pop-up(s) où il
-- est associé et pour l'équipe attribuée à ce(s) lieu(x) (retour utilisateur du 2026-08-24).

-- ventes_sumup était strictement réservée aux admins (migration 0035) : les managers ont besoin de
-- voir "Chiffres" (CA carte/espèces) pour leur propre lieu — même principe de scope que
-- ventes_sumup_lignes (migration 0068), qui a déjà cette policy pour les lignes produit.
drop policy if exists "ventes_sumup_lecture_scopee" on public.ventes_sumup;
create policy "ventes_sumup_lecture_scopee" on public.ventes_sumup
  for select using (
    public.is_admin()
    or (
      pop_up_id is not null
      and exists (
        select 1 from public.profil_pop_ups
        where profile_id = auth.uid() and pop_up_id = ventes_sumup.pop_up_id
      )
    )
  );

-- Makeda et Pierre : deux salariés existants qu'on transforme en managers (accès mobile complet à
-- leur pop-up et leur équipe, cf. app/(app)/equipe.tsx et le reste de l'app déjà piloté par
-- type_contrat = 'manager' : PlanningMobile, VentesEcran, DemandesEcran, BarreNavigationBasse).
update public.profiles
set type_contrat = 'manager'
where id in ('016d9396-da0e-4d3c-a545-244a91d43c6a', 'c794b0f9-40e1-4306-9999-11ee87d16ca7');

-- Droits "équipe" + "calendrier" scopés à leurs pop-up(s) attribués (pas null/tous, contrairement
-- au compte de test Pierre Pietruzzella de la migration 0047) — c'est ce scope précis qui pilote
-- app/(app)/equipe.tsx (fiche RH de l'équipe) et calendrier.web.tsx.
insert into public.droits_employe (id, profile_id, fonctionnalite, pop_up_id)
select gen_random_uuid(), pp.profile_id, f, pp.pop_up_id
from public.profil_pop_ups pp
cross join unnest(array['equipe', 'calendrier']) as f
where pp.profile_id in ('016d9396-da0e-4d3c-a545-244a91d43c6a', 'c794b0f9-40e1-4306-9999-11ee87d16ca7')
  and not exists (
    select 1 from public.droits_employe de
    where de.profile_id = pp.profile_id and de.fonctionnalite = f and de.pop_up_id = pp.pop_up_id
  );
