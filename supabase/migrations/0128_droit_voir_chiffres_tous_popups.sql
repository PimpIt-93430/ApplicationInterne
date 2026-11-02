-- Retour utilisateur du 2026-11-02 : droit "voir les chiffres de tous les pop-ups" (ex. le manager
-- de Val d'Europe qui veut comparer avec les autres) — lecture seule des ventes de TOUS les
-- pop-ups, sans rien ouvrir d'autre (stock, planning, équipe restent scopés à ses lieux attribués).
-- Coché par un admin dans le Hub (Équipe > Droits).

alter table public.profiles
  add column voir_chiffres_tous_popups boolean not null default false;

-- Seul un admin peut changer ce flag (la policy profils_maj laisse chacun modifier son propre
-- profil). hub_role_comptable avait le même trou — protégé au passage.
create or replace function public.protect_profile_privileged_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.actif := old.actif;
    new.heures_max_semaine := old.heures_max_semaine;
    new.hub_role_comptable := old.hub_role_comptable;
    new.voir_chiffres_tous_popups := old.voir_chiffres_tous_popups;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.voit_chiffres_tous_popups()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $$
  select coalesce((select voir_chiffres_tous_popups from public.profiles where id = auth.uid()), false);
$$;

-- Lecture des ventes : on ajoute le flag aux policies existantes (mêmes conditions sinon).
drop policy "ventes_especes_lecture" on public.ventes_especes;
create policy "ventes_especes_lecture" on public.ventes_especes for select using (
  is_admin()
  or public.voit_chiffres_tous_popups()
  or exists (select 1 from profil_pop_ups pp where pp.profile_id = auth.uid() and pp.pop_up_id = ventes_especes.pop_up_id)
);

drop policy "ventes_sumup_lecture_scopee" on public.ventes_sumup;
create policy "ventes_sumup_lecture_scopee" on public.ventes_sumup for select using (
  is_admin()
  or public.voit_chiffres_tous_popups()
  or (pop_up_id is not null and exists (
    select 1 from profil_pop_ups where profil_pop_ups.profile_id = auth.uid() and profil_pop_ups.pop_up_id = ventes_sumup.pop_up_id
  ))
);

drop policy "ventes_sumup_lignes_lecture" on public.ventes_sumup_lignes;
create policy "ventes_sumup_lignes_lecture" on public.ventes_sumup_lignes for select using (
  is_admin()
  or public.voit_chiffres_tous_popups()
  or (pop_up_id is not null and exists (
    select 1 from profil_pop_ups where profil_pop_ups.profile_id = (select auth.uid()) and profil_pop_ups.pop_up_id = ventes_sumup_lignes.pop_up_id
  ))
);

-- Rattachement terminal SumUp → pop-up, nécessaire pour répartir le CA du jour par pop-up.
create policy "sumup_emails_pop_up_lecture_chiffres" on public.sumup_emails_pop_up for select using (
  public.voit_chiffres_tous_popups()
);
