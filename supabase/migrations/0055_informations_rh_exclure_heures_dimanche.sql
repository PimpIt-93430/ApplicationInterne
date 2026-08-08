-- Inversion du sens du réglage (retour utilisateur) : par défaut les heures du dimanche doivent
-- être comptées comme n'importe quel autre jour ; on ne les exclut du total RH que pour les
-- personnes explicitement marquées comme payées sur un contrat séparé pour le dimanche.
alter table public.informations_rh
  rename column compter_heures_dimanche to exclure_heures_dimanche;
