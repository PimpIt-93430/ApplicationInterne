-- Corrige protect_profile_privileged_fields : le trigger ne doit bloquer les
-- changements de role/actif/heures_max_semaine QUE quand la modification vient
-- d'un utilisateur authentifié non-admin (via l'app). Une modification faite
-- depuis le SQL Editor (ou tout accès direct sans session) n'a pas de auth.uid()
-- et doit être laissée passer, sinon elle est silencieusement annulée.

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
  end if;
  new.updated_at := now();
  return new;
end;
$$;
