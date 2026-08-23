-- Pause déjeuner optionnelle sur l'horaire récurrent d'un employé (même principe que
-- planning_shifts.pause_debut/pause_fin, migration 0057) : nécessaire pour que la pause d'un
-- créneau généré automatiquement (cf. genererPlanning) puisse venir de son horaire habituel.
alter table public.horaires_recurrents_profil
  add column if not exists pause_debut time,
  add column if not exists pause_fin time;

-- Pause optionnelle sur chacun des deux créneaux prédéfinis (Matin / Après-midi) d'un pop-up
-- (migration 0060) : lue par les boutons Matin/Après-midi de l'horaire récurrent (Équipe).
alter table public.pop_ups
  add column if not exists matin_pause_debut time,
  add column if not exists matin_pause_fin time,
  add column if not exists apres_midi_pause_debut time,
  add column if not exists apres_midi_pause_fin time;
