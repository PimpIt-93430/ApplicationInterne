-- Retour utilisateur du 2026-09-17 : paliers de réduction volume (1500€ -5%, 3000€ -8%, 6000€
-- -12%, 10000€ -18%) sur l'espace revendeur. total_ht reste le total PAYABLE (après réduction,
-- déjà utilisé tel quel dans le Hub/PDF) ; sous_total_ht et remise_pourcentage gardent le détail
-- pour l'affichage. Nullable/0 par défaut : n'affecte pas les commandes déjà enregistrées.
alter table commandes_revendeurs add column sous_total_ht numeric;
alter table commandes_revendeurs add column remise_pourcentage numeric not null default 0;
update commandes_revendeurs set sous_total_ht = total_ht where sous_total_ht is null;
