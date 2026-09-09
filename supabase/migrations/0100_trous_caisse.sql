-- Trous de caisse (Hub > Finance > Trou, admin uniquement) — cf. retour utilisateur : "un coin
-- qu'on appellera trou, que pour les admin, où on pourra mettre le trou, le jour, le pop up, la
-- personne qui a fermé et les personnes qui travaillaient ce jour-là". Les deux derniers champs
-- sont pré-remplis automatiquement depuis planning_shifts (cf. Hub app/(hub)/trou/actions.ts) mais
-- enregistrés tels quels à la création : un snapshot du jour, pas recalculé après coup si le
-- planning est corrigé plus tard.

create table trous_caisse (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references pop_ups(id) on delete restrict,
  date date not null,
  montant numeric not null,
  personne_fermeture_id uuid references profiles(id) on delete set null,
  personnes_presentes_ids uuid[] not null default '{}',
  note text,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index trous_caisse_pop_up_date_idx on trous_caisse (pop_up_id, date desc);

alter table trous_caisse enable row level security;

-- Même garde-fou que informations_rh/export comptable : données financières nominatives,
-- réservées aux admins (is_admin(), déjà utilisée ailleurs) — jamais visible du rôle "local" ni
-- "comptable".
create policy trous_caisse_admin on trous_caisse
  for all
  using (is_admin())
  with check (is_admin());
