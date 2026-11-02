-- Calendrier d'école : le manager peut modifier directement celui des alternants de ses pop-ups
-- (retour utilisateur du 2026-11-02) — jusqu'ici lecture seule pour lui, écriture admin uniquement
-- (cf. 0052). "Ses pop-ups" = au moins un pop-up en commun dans profil_pop_ups.

create or replace function public.est_manager_de_alternant(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.profiles moi
    join public.profil_pop_ups mes_pp on mes_pp.profile_id = moi.id
    join public.profil_pop_ups ses_pp on ses_pp.pop_up_id = mes_pp.pop_up_id
    join public.profiles cible on cible.id = ses_pp.profile_id
    where moi.id = auth.uid()
      and moi.type_contrat = 'manager'
      and cible.id = p_profile_id
      and cible.type_contrat = 'alternant'
  );
$$;

drop policy if exists jours_ecole_ecriture on public.jours_ecole_alternant;
create policy jours_ecole_ecriture on public.jours_ecole_alternant
  for insert with check (public.is_admin() or public.est_manager_de_alternant(profile_id));

drop policy if exists jours_ecole_suppression on public.jours_ecole_alternant;
create policy jours_ecole_suppression on public.jours_ecole_alternant
  for delete using (public.is_admin() or public.est_manager_de_alternant(profile_id));
