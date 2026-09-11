-- Recettes exceptionnelles (cf. retour utilisateur du 2026-09-11) : revenus hors pop-up, ponctuels
-- ou récurrents — même structure que flux_tresorerie_depenses (sans est_pop_up, non pertinent ici).
create table flux_tresorerie_recettes_exceptionnelles (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  montant numeric not null,
  type text not null check (type = any (array['ponctuelle','recurrente'])),
  date date not null,
  frequence text check (frequence = any (array['mensuelle','trimestrielle','annuelle'])),
  date_fin date,
  note text,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint flux_tresorerie_recettes_exceptionnelles_frequence_coherente check (
    (type = 'recurrente' and frequence is not null) or (type = 'ponctuelle' and frequence is null)
  )
);

alter table flux_tresorerie_recettes_exceptionnelles enable row level security;
create policy flux_tresorerie_recettes_exceptionnelles_admin on flux_tresorerie_recettes_exceptionnelles
  for all using (is_admin()) with check (is_admin());
