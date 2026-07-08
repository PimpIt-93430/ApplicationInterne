-- Une case peut désormais contenir plusieurs pins différents (pas de colonne "capacité" : le
-- nombre de pins est simplement celui qu'on lui attribue). Suppression de numero_case (un pin
-- peut être dans autant de cases que nécessaire, une fois par case). Le remplissage en % est
-- remplacé par une pesée : quantite_restante = poids_pese / poids_unitaire du pin.

alter table public.pop_up_pin_boites
  drop constraint if exists pop_up_pin_boites_pop_up_id_case_position_key;
alter table public.pop_up_pin_boites
  drop constraint if exists pop_up_pin_boites_pop_up_id_pin_id_numero_case_key;

alter table public.pop_up_pin_boites drop column if exists numero_case;
alter table public.pop_up_pin_boites drop column if exists niveau_remplissage;

alter table public.pop_up_pin_boites
  add column if not exists poids_pese numeric check (poids_pese >= 0);
alter table public.pop_up_pin_boites
  add column if not exists quantite_restante numeric check (quantite_restante >= 0);

alter table public.pop_up_pin_boites
  add constraint pop_up_pin_boites_pop_up_id_case_position_pin_id_key
  unique (pop_up_id, case_position, pin_id);

-- stock_mouvements : remplissage (%) devient pesee (poids -> quantité calculée)
alter table public.stock_mouvements drop constraint if exists stock_mouvements_type_check;

-- Les anciennes lignes 'remplissage' (%) n'ont pas de poids pesé associé : on les requalifie en
-- 'pesee' pour respecter la nouvelle contrainte, sans pouvoir reconstituer poids_pese/quantite_calculee.
update public.stock_mouvements set type = 'pesee' where type = 'remplissage';

alter table public.stock_mouvements drop column if exists numero_case;
alter table public.stock_mouvements drop column if exists niveau_remplissage;

alter table public.stock_mouvements add column if not exists poids_pese numeric;
alter table public.stock_mouvements add column if not exists quantite_calculee numeric;

alter table public.stock_mouvements
  add constraint stock_mouvements_type_check
  check (type in ('reception', 'ajustement', 'pesee'));
