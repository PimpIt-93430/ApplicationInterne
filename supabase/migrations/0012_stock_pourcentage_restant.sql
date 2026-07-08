-- Certains pins n'ont plus de sac à peser (fin de stock en réserve) : dans ce cas, l'alternant
-- estime directement un pourcentage restant pour savoir combien il faut en ramener, plutôt que
-- de peser. Ce pourcentage est indépendant de la pesée au poids (une case-pin utilise l'une ou
-- l'autre méthode selon ce qui est disponible au moment du comptage).

alter table public.pop_up_pin_boites
  add column if not exists pourcentage_restant numeric check (pourcentage_restant between 0 and 100);

alter table public.stock_mouvements drop constraint if exists stock_mouvements_type_check;

alter table public.stock_mouvements
  add column if not exists pourcentage_restant numeric check (pourcentage_restant between 0 and 100);

alter table public.stock_mouvements
  add constraint stock_mouvements_type_check
  check (type in ('reception', 'ajustement', 'pesee', 'estimation'));
