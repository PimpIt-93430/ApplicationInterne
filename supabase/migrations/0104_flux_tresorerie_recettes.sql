-- Recettes du flux de trésorerie (Hub > Finance > Trésorerie) — cf. retour utilisateur : "pour les
-- recettes on a tous les pop up il faut qu'on mette un chiffre d'affaire moyen par jour et par
-- mois HT et les charges variables (ex. 30% de charges pour 1€ vendu HT)... les revenus commencent
-- au premier jour du loyer". Un pop-up ici = une ligne de dépense récurrente "Loyer X" marquée
-- est_pop_up (cf. migration 0103) — pop_up_nom doit correspondre au nom utilisé dans ce libellé
-- (après le préfixe "Loyer "), comparaison faite côté Hub (FluxTresorerieClient.tsx), pas de FK :
-- même logique volontairement souple que est_pop_up (un pop-up peut exister ici avant d'être créé
-- dans la table pop_ups réelle).
create table flux_tresorerie_recettes (
  id uuid primary key default gen_random_uuid(),
  pop_up_nom text not null,
  ca_jour_ht numeric not null,
  ca_mois_ht numeric not null,
  -- Pourcentage (0-100) : part du CA HT qui part en charges variables (ex. 30 = 30%). Le reste
  -- (CA_mois_HT × (1 - taux/100)) est la contribution nette ajoutée au solde chaque mois.
  taux_charges_variables numeric not null,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table flux_tresorerie_recettes enable row level security;

create policy flux_tresorerie_recettes_admin on flux_tresorerie_recettes
  for all
  using (is_admin())
  with check (is_admin());
