-- Flux de trésorerie (Hub > Finance > Trésorerie, admin uniquement) — cf. retour utilisateur :
-- "un flux de trésorerie sur 1 an avec toutes les grosses dépenses qu'on va avoir, la tva etc,
-- pour voir combien il faut qu'on gagne". Première étape (confirmée) : uniquement les dépenses
-- (ponctuelles et récurrentes), affichées sur un graphique dans le temps. Les recettes/prévisions
-- de revenu viendront dans une étape suivante, pas encore modélisées ici.

create table flux_tresorerie_depenses (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  montant numeric not null,
  type text not null check (type in ('ponctuelle', 'recurrente')),
  -- Ponctuelle : date d'échéance unique. Récurrente : date de la première occurrence, à partir de
  -- laquelle la fréquence se répète (jusqu'à date_fin si renseignée, ou indéfiniment sinon).
  date date not null,
  frequence text check (frequence in ('mensuelle', 'trimestrielle', 'annuelle')),
  date_fin date,
  note text,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint flux_tresorerie_depenses_frequence_coherente check (
    (type = 'recurrente' and frequence is not null) or (type = 'ponctuelle' and frequence is null)
  )
);

create index flux_tresorerie_depenses_date_idx on flux_tresorerie_depenses (date);

alter table flux_tresorerie_depenses enable row level security;

-- Même garde-fou que trous_caisse/informations_rh : données financières, réservées aux admins.
create policy flux_tresorerie_depenses_admin on flux_tresorerie_depenses
  for all
  using (is_admin())
  with check (is_admin());
