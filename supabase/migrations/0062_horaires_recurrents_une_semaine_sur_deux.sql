-- Rythme "un jour sur deux" pour un horaire récurrent : la personne ne travaille ce jour de la
-- semaine qu'une semaine sur deux (ex. tous les autres lundis), la parité étant calée sur la
-- semaine d'ouverture du pop-up (pop_ups.date_debut) plutôt que sur une date arbitraire.
alter table public.horaires_recurrents_profil
  add column if not exists frequence text not null default 'toutes_les_semaines'
    check (frequence in ('toutes_les_semaines', 'une_semaine_sur_deux')),
  add column if not exists semaine_reference text
    check (semaine_reference in ('premiere', 'deuxieme'));
