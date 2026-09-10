-- Remplace le tag pop_up_id (lié à la table pop_ups réelle) par une simple case à cocher
-- indépendante — cf. retour utilisateur : "il faut juste cocher si c'est un pop-up, ya des
-- pop-up qui sont pas rentrés dans l'appli car on les a pas encore fait" : un pop-up prévu mais
-- pas encore créé dans pop_ups ne pouvait pas être sélectionné dans le menu déroulant.
alter table flux_tresorerie_depenses
  drop column pop_up_id,
  add column est_pop_up boolean not null default false;
