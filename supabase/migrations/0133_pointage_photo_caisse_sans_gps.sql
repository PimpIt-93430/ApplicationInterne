-- Pointage : on coupe tout le GPS (retour utilisateur du 2026-11-02) — QR code + photo de la caisse
-- prise juste après le scan, c'est la photo qui prouve que la personne est au pop-up. L'admin et le
-- manager du pop-up voient la photo dans l'écran Pointages.

drop function if exists public.pointer(text, double precision, double precision, boolean);
drop function if exists public.definir_position_popup(uuid, double precision, double precision);
drop function if exists public.distance_metres(double precision, double precision, double precision, double precision);

alter table public.pointages
  drop column lat,
  drop column lon,
  drop column distance_m,
  drop column gps_ok,
  add column photo_path text;
alter table public.pop_up_pointage drop column rayon_m;

-- Bucket privé : photos lues via URL signée. Chaque employé n'écrit que dans son dossier
-- (<son id>/...) ; lecture par lui-même, l'admin, ou le manager du pop-up du pointage.
insert into storage.buckets (id, name, public)
values ('pointages-photos', 'pointages-photos', false)
on conflict (id) do nothing;

create policy pointages_photos_envoi on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pointages-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy pointages_photos_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pointages-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.pointages pt
        where pt.photo_path = storage.objects.name and public.est_manager_du_popup(pt.pop_up_id)
      )
    )
  );

-- Arrivée ou départ déduit tout seul (dernier pointage du jour sur ce pop-up). La photo est
-- obligatoire et doit être dans le dossier de la personne connectée (pas celle d'un autre).
create or replace function public.pointer(p_code text, p_photo_path text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pop_up public.pop_ups%rowtype;
  v_dernier public.pointages%rowtype;
  v_type text;
  v_ligne public.pointages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Non connecté.';
  end if;

  select p.* into v_pop_up
  from public.pop_up_pointage pp join public.pop_ups p on p.id = pp.pop_up_id
  where pp.code = p_code;
  if not found then
    raise exception 'QR code inconnu — ce n''est pas un QR de pointage Pimp It.';
  end if;
  if not v_pop_up.pointage_actif then
    raise exception 'Le pointage n''est pas activé pour %.', v_pop_up.nom;
  end if;
  if p_photo_path is null or split_part(p_photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'Photo de la caisse manquante.';
  end if;

  select * into v_dernier from public.pointages
  where profile_id = auth.uid() and pop_up_id = v_pop_up.id
    and (horodatage at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
  order by horodatage desc limit 1;

  -- Double envoi (moins de 2 min) : on ne crée pas un départ juste après l'arrivée.
  if found and v_dernier.horodatage > now() - interval '2 minutes' then
    return json_build_object(
      'type', v_dernier.type,
      'horodatage', v_dernier.horodatage,
      'pop_up_nom', v_pop_up.nom,
      'deja_fait', true
    );
  end if;

  v_type := case when found and v_dernier.type = 'arrivee' then 'depart' else 'arrivee' end;

  insert into public.pointages (profile_id, pop_up_id, type, photo_path)
  values (auth.uid(), v_pop_up.id, v_type, p_photo_path)
  returning * into v_ligne;

  return json_build_object(
    'type', v_ligne.type,
    'horodatage', v_ligne.horodatage,
    'pop_up_nom', v_pop_up.nom,
    'deja_fait', false
  );
end;
$$;
revoke all on function public.pointer(text, text) from public, anon;
grant execute on function public.pointer(text, text) to authenticated;
