-- Droits simplifiés (retour utilisateur du 2026-11-03) — trois niveaux :
--   * admin : tout, partout (inchangé) ;
--   * responsable de pop-up : tout sur son/ses pop-up(s) + voit les chiffres des autres pop-ups ;
--   * alternants : inchangés.
-- "Responsable de" = un droit (calendrier/équipe) sur ce pop-up dans droits_employe, accordé par
-- l'admin (Équipe > Droits > Responsable de pop-up, qui donne les deux d'un coup). Ce n'est plus
-- le type de contrat "manager" + l'affectation qui compte : un manager affecté en renfort ailleurs
-- n'est pas responsable de ces pop-ups-là. Le Local reste comme avant.

-- 1) Responsable d'un pop-up précis.
create or replace function public.est_responsable_popup(p_pop_up_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.droits_employe d
    where d.profile_id = auth.uid()
      and (d.pop_up_id is null or d.pop_up_id = p_pop_up_id)
  );
$$;

-- 2) Les fonctions "manager" existantes (utilisées par les policies pointages, calendrier école…)
--    reposent désormais sur la responsabilité, plus sur type_contrat = 'manager'.
create or replace function public.est_manager_du_popup(p_pop_up_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.est_responsable_popup(p_pop_up_id);
$$;

create or replace function public.est_manager_de_alternant(p_profile_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1
    from public.profiles cible
    join public.profil_pop_ups pp on pp.profile_id = cible.id
    where cible.id = p_profile_id
      and cible.type_contrat = 'alternant'
      and public.est_responsable_popup(pp.pop_up_id)
  );
$$;

-- 3) Un responsable voit les chiffres de tous les pop-ups (en plus de la case par profil).
create or replace function public.voit_chiffres_tous_popups()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select voir_chiffres_tous_popups from public.profiles where id = auth.uid()), false)
      or exists (select 1 from public.droits_employe where profile_id = auth.uid());
$$;

-- 4) Suppression d'un remplissage de boîte : responsable du pop-up (avant : tout manager affecté).
drop policy if exists pop_up_boite_remplissages_suppression on public.pop_up_boite_remplissages;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'pop_up_boite_remplissages' and cmd = 'DELETE'
  loop
    execute format('drop policy %I on public.pop_up_boite_remplissages', pol.policyname);
  end loop;
end $$;
create policy pop_up_boite_remplissages_suppression on public.pop_up_boite_remplissages
  for delete using (is_admin() or est_manager_du_popup(pop_up_id));

-- 5) Équipe actuelle : Edgar passe alternant ; responsables = Tisko (Carré Sénart), Chinois
--    (Créteil Soleil), Pierre (Val d'Europe), Makeda (Oparinord) — les trois derniers l'étaient déjà.
update public.profiles set type_contrat = 'alternant' where nom_complet = 'Edgar Salmagne';

insert into public.droits_employe (profile_id, fonctionnalite, pop_up_id)
select p.id, f.fonctionnalite, pu.id
from public.profiles p
cross join (values ('calendrier'), ('equipe')) as f(fonctionnalite)
join public.pop_ups pu on pu.nom = 'Carré Sénart'
where p.nom_complet = 'Tisko'
  and not exists (
    select 1 from public.droits_employe d
    where d.profile_id = p.id and d.fonctionnalite = f.fonctionnalite and d.pop_up_id = pu.id
  );
