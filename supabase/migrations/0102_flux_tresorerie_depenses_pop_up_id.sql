-- Associe une dépense du flux de trésorerie à un pop-up réel (cf. retour utilisateur : "ajouter
-- dans le tableau des dépenses un petit truc qui dit si c'est un loyer d'un pop-up, comme ça
-- quand on fera les recettes on fera par pop-up") — simple tag optionnel, sans logique de calcul
-- (contrairement à la première tentative compte_comme_pop_up/variable_par_pop_up, annulée le
-- 2026-09-10 : "on calculera les charges variables grâce aux recettes après, rollback").
alter table flux_tresorerie_depenses
  add column pop_up_id uuid references pop_ups(id) on delete set null;
