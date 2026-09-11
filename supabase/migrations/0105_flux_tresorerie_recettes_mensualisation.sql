-- Recettes par pop-up (cf. retour utilisateur du 2026-09-11) : ca_jour_ht devient la référence
-- "100% des ventes par jour" pour le pop-up, et le CA prévu par mois se calcule désormais à partir
-- d'un pourcentage saisi mois par mois (table flux_tresorerie_recettes_mois), plus ca_mois_ht fixe.
alter table flux_tresorerie_recettes
  drop column ca_mois_ht,
  alter column taux_charges_variables set default 30;

comment on column flux_tresorerie_recettes.ca_jour_ht is
  'CA HT correspondant à 100% des ventes pour une journée (référence) — le CA prévu par mois se calcule via flux_tresorerie_recettes_mois.pourcentage × ce chiffre × nb de jours du mois.';

create table flux_tresorerie_recettes_mois (
  id uuid primary key default gen_random_uuid(),
  recette_id uuid not null references flux_tresorerie_recettes(id) on delete cascade,
  mois date not null,
  pourcentage numeric not null default 100 check (pourcentage >= 0),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  constraint flux_tresorerie_recettes_mois_premier_jour check (extract(day from mois) = 1),
  unique (recette_id, mois)
);

alter table flux_tresorerie_recettes_mois enable row level security;

create policy flux_tresorerie_recettes_mois_admin on flux_tresorerie_recettes_mois
  for all using (is_admin()) with check (is_admin());
