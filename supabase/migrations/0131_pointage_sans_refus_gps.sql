-- Pointage : le GPS ne bloque plus (retour utilisateur du 2026-11-02, "faut pas que ce soit
-- refusé") — le pointage est toujours enregistré, et gps_ok dit si la position était bonne au
-- moment du scan. L'admin/le manager voit OK / hors zone dans l'écran Pointages.
--   gps_ok = true  : à moins de rayon_m du pop-up
--   gps_ok = false : trop loin, position refusée/indisponible, ou position simulée
--   gps_ok = null  : position du pop-up pas encore enregistrée (impossible de vérifier)

alter table public.pointages add column gps_ok boolean;

drop function if exists public.pointer(text, double precision, double precision);

create or replace function public.pointer(
  p_code text,
  p_lat double precision,
  p_lon double precision,
  p_position_simulee boolean default false
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pop_up public.pop_ups%rowtype;
  v_rayon integer;
  v_distance double precision;
  v_gps_ok boolean;
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
  select rayon_m into v_rayon from public.pop_up_pointage where pop_up_id = v_pop_up.id;

  if p_lat is not null and p_lon is not null and v_pop_up.lat is not null and v_pop_up.lon is not null then
    v_distance := public.distance_metres(p_lat, p_lon, v_pop_up.lat::double precision, v_pop_up.lon::double precision);
  end if;

  v_gps_ok := case
    when v_pop_up.lat is null or v_pop_up.lon is null then null
    when p_position_simulee or v_distance is null then false
    else v_distance <= v_rayon
  end;

  select * into v_dernier from public.pointages
  where profile_id = auth.uid() and pop_up_id = v_pop_up.id
    and (horodatage at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
  order by horodatage desc limit 1;

  -- Double scan par erreur (le QR reste dans le cadre) : on ne crée pas un départ 10 s après
  -- l'arrivée, on renvoie juste le pointage déjà fait.
  if found and v_dernier.horodatage > now() - interval '2 minutes' then
    return json_build_object(
      'type', v_dernier.type,
      'horodatage', v_dernier.horodatage,
      'pop_up_nom', v_pop_up.nom,
      'deja_fait', true
    );
  end if;

  v_type := case when found and v_dernier.type = 'arrivee' then 'depart' else 'arrivee' end;

  insert into public.pointages (profile_id, pop_up_id, type, lat, lon, distance_m, gps_ok)
  values (auth.uid(), v_pop_up.id, v_type, p_lat, p_lon, round(v_distance), v_gps_ok)
  returning * into v_ligne;

  return json_build_object(
    'type', v_ligne.type,
    'horodatage', v_ligne.horodatage,
    'pop_up_nom', v_pop_up.nom,
    'deja_fait', false
  );
end;
$$;
revoke all on function public.pointer(text, double precision, double precision, boolean) from public, anon;
grant execute on function public.pointer(text, double precision, double precision, boolean) to authenticated;
