-- Rattache chaque profil à un pop-up (son équipe), pour l'écran de gestion des pop-ups.

alter table public.profiles
  add column if not exists pop_up_id uuid references public.pop_ups (id) on delete set null;

-- Seul un admin peut changer l'équipe (pop-up) d'un profil, comme role/actif/heures_max_semaine.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.actif := old.actif;
    new.heures_max_semaine := old.heures_max_semaine;
    new.pop_up_id := old.pop_up_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
