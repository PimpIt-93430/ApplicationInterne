-- Retour utilisateur du 2026-09-18 : "il y a des générations qui ont les mêmes coques ducoup je
-- veux que tu fasses une ligne = un modele en dessous noir ou rose" — remplace modele (génération
-- iPhone) x variante (Normal/Pro/Pro Max/Plus) par un seul modele regroupé (13 valeurs), la
-- variante disparaît. coques_stock (stock visé, 40 lignes placeholder) est réinitialisé à 0 pour
-- les 13 x 2 nouvelles combinaisons (l'utilisateur recompte ensuite à la main). coques_inventaires
-- (160 lignes réelles, historique jamais écrasé) garde ses lignes telles quelles pour l'audit mais
-- devient orphelin vis-à-vis du nouveau référentiel modele — accepté explicitement par
-- l'utilisateur ("je vais modifier l'inventaire après") ; sa contrainte modele est donc ajoutée en
-- NOT VALID pour ne pas invalider les anciennes valeurs ('Iphone 13', etc.) déjà en base.
-- coques_mapping_sumup est vide (0 ligne), rien à migrer.

alter table coques_stock drop constraint coques_stock_modele_check;
alter table coques_stock drop constraint coques_stock_variante_check;
alter table coques_stock drop column variante;
delete from coques_stock;
alter table coques_stock add constraint coques_stock_modele_check check (modele = any (array[
  '13/14/15', '13/14 Pro', '13/14 Pro Max', '15 Pro', '15 Pro Max', '15 Plus',
  '16', '16 Pro', '16 Pro Max', '16 Plus', '17', '17 Pro', '17 Pro Max'
]));

insert into coques_stock (modele, couleur, stock_initial)
select modele, couleur, 0
from unnest(array[
  '13/14/15', '13/14 Pro', '13/14 Pro Max', '15 Pro', '15 Pro Max', '15 Plus',
  '16', '16 Pro', '16 Pro Max', '16 Plus', '17', '17 Pro', '17 Pro Max'
]) as modele
cross join unnest(array['Rose', 'Noir']) as couleur;

alter table coques_inventaires drop constraint coques_inventaires_modele_check;
alter table coques_inventaires drop constraint coques_inventaires_variante_check;
alter table coques_inventaires drop column variante;
alter table coques_inventaires add constraint coques_inventaires_modele_check check (modele = any (array[
  '13/14/15', '13/14 Pro', '13/14 Pro Max', '15 Pro', '15 Pro Max', '15 Plus',
  '16', '16 Pro', '16 Pro Max', '16 Plus', '17', '17 Pro', '17 Pro Max'
])) not valid;

alter table coques_mapping_sumup drop constraint coques_mapping_sumup_modele_check;
alter table coques_mapping_sumup drop constraint coques_mapping_sumup_variante_check;
alter table coques_mapping_sumup drop column variante;
alter table coques_mapping_sumup add constraint coques_mapping_sumup_modele_check check (modele = any (array[
  '13/14/15', '13/14 Pro', '13/14 Pro Max', '15 Pro', '15 Pro Max', '15 Plus',
  '16', '16 Pro', '16 Pro Max', '16 Plus', '17', '17 Pro', '17 Pro Max'
]));
