-- Certaines personnes sont payées sur un contrat séparé pour le dimanche : par défaut, leurs
-- heures du dimanche ne doivent pas être comptées dans le total RH (Demande & RH). Réglable par
-- personne depuis la fiche employé (onglet Contrat, écran Équipe web).
alter table public.informations_rh
  add column if not exists compter_heures_dimanche boolean not null default false;
