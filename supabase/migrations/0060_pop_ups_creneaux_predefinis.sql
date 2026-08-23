-- Créneaux matin/après-midi prédéfinis par pop-up : un préréglage fixe (pas par jour de semaine,
-- contrairement à regles_horaires_ouverture) que l'admin règle une fois par lieu et que les
-- boutons Matin/Après-midi de l'horaire récurrent d'un employé (Équipe) viennent lire.
alter table public.pop_ups
  add column if not exists matin_debut time,
  add column if not exists matin_fin time,
  add column if not exists apres_midi_debut time,
  add column if not exists apres_midi_fin time;
