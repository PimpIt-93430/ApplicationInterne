-- Pointage (retour utilisateur du 2026-11-02) : à l'arrivée et au départ, la personne scanne le QR
-- code affiché au pop-up ET l'app envoie sa position GPS — le QR prouve le lieu, le GPS empêche de
-- pointer depuis chez soi avec une photo du QR. Tout est vérifié côté serveur (fonction pointer),
-- heure = now() du serveur, jamais celle du téléphone.

-- Code secret de chaque QR, dans une table à part : pop_ups est lisible par tout employé connecté,
-- le code ne doit l'être que par l'admin (impression, cf. Hub > Pointage).
create table public.pop_up_pointage (
  pop_up_id uuid primary key references public.pop_ups(id) on delete cascade,
  code text not null unique default encode(gen_random_bytes(16), 'hex'),
  rayon_m integer not null default 300 check (rayon_m between 50 and 2000),
  updated_at timestamptz not null default now()
);
alter table public.pop_up_pointage enable row level security;
create policy pop_up_pointage_admin on public.pop_up_pointage
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.pop_up_pointage (pop_up_id) select id from public.pop_ups;

create table public.pointages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  pop_up_id uuid not null references public.pop_ups(id) on delete cascade,
  type text not null check (type in ('arrivee', 'depart')),
  horodatage timestamptz not null default now(),
  lat double precision,
  lon double precision,
  distance_m integer,
  -- Pointage ajouté/corrigé à la main par un admin ou un manager (oubli de pointer, téléphone mort).
  saisi_par uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index pointages_pop_up_horodatage on public.pointages (pop_up_id, horodatage);
create index pointages_profile_horodatage on public.pointages (profile_id, horodatage);
alter table public.pointages enable row level security;

-- Manager d'un pop-up = type_contrat 'manager' attribué à ce pop-up (même définition que 0129).
create or replace function public.est_manager_du_popup(p_pop_up_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles moi
    join public.profil_pop_ups pp on pp.profile_id = moi.id
    where moi.id = auth.uid() and moi.type_contrat = 'manager' and pp.pop_up_id = p_pop_up_id
  );
$$;

create policy pointages_lecture on public.pointages
  for select using (profile_id = auth.uid() or public.is_admin() or public.est_manager_du_popup(pop_up_id));
-- Pas d'insert direct pour un employé (il passerait outre la vérification QR/GPS) : uniquement via
-- pointer(). Admin/manager peuvent corriger à la main.
create policy pointages_correction on public.pointages
  for all using (public.is_admin() or public.est_manager_du_popup(pop_up_id))
  with check ((public.is_admin() or public.est_manager_du_popup(pop_up_id)) and saisi_par = auth.uid());

create or replace function public.distance_metres(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- Arrivée ou départ déduit tout seul : dernier pointage du jour (heure de Paris) sur ce pop-up =
-- arrivée → ce scan est un départ, sinon une arrivée. Deux scans à moins de 2 min d'écart sont
-- refusés (double scan par erreur).
create or replace function public.pointer(p_code text, p_lat double precision, p_lon double precision)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pop_up public.pop_ups%rowtype;
  v_rayon integer;
  v_distance double precision;
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

  if v_pop_up.lat is null or v_pop_up.lon is null then
    raise exception 'La position de % n''est pas encore enregistrée — demande à ton manager de le faire depuis l''écran Pointages.', v_pop_up.nom;
  end if;
  if p_lat is null or p_lon is null then
    raise exception 'Position GPS introuvable.';
  end if;

  v_distance := public.distance_metres(p_lat, p_lon, v_pop_up.lat::double precision, v_pop_up.lon::double precision);
  if v_distance > v_rayon then
    raise exception 'Tu es à % m de % : il faut être sur place pour pointer.', round(v_distance), v_pop_up.nom;
  end if;

  select * into v_dernier from public.pointages
  where profile_id = auth.uid() and pop_up_id = v_pop_up.id
    and (horodatage at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
  order by horodatage desc limit 1;

  if found and v_dernier.horodatage > now() - interval '2 minutes' then
    raise exception 'Tu viens déjà de pointer (%).', case v_dernier.type when 'arrivee' then 'arrivée' else 'départ' end;
  end if;

  v_type := case when found and v_dernier.type = 'arrivee' then 'depart' else 'arrivee' end;

  insert into public.pointages (profile_id, pop_up_id, type, lat, lon, distance_m)
  values (auth.uid(), v_pop_up.id, v_type, p_lat, p_lon, round(v_distance))
  returning * into v_ligne;

  return json_build_object(
    'type', v_ligne.type,
    'horodatage', v_ligne.horodatage,
    'pop_up_nom', v_pop_up.nom,
    'distance_m', v_ligne.distance_m
  );
end;
$$;
revoke all on function public.pointer(text, double precision, double precision) from public, anon;
grant execute on function public.pointer(text, double precision, double precision) to authenticated;

-- "Enregistrer la position du pop-up ici" (écran Pointages, sur place) : admin ou manager du
-- pop-up — pop_ups reste sinon en écriture admin uniquement.
create or replace function public.definir_position_popup(p_pop_up_id uuid, p_lat double precision, p_lon double precision)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_admin() or public.est_manager_du_popup(p_pop_up_id)) then
    raise exception 'Réservé à l''admin ou au manager du pop-up.';
  end if;
  update public.pop_ups set lat = p_lat, lon = p_lon where id = p_pop_up_id;
end;
$$;
revoke all on function public.definir_position_popup(uuid, double precision, double precision) from public, anon;
grant execute on function public.definir_position_popup(uuid, double precision, double precision) to authenticated;

-- Nouveau pop-up → son QR de pointage est créé automatiquement.
create or replace function public.creer_pointage_popup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.pop_up_pointage (pop_up_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger pop_ups_creer_pointage after insert on public.pop_ups
  for each row execute function public.creer_pointage_popup();
