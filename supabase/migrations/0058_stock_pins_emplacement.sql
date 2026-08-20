-- Emplacement physique de stockage de chaque pin (plan d'entrepôt calculé à partir de
-- l'historique des commandes fournisseur) : "boite_rouge" (numérotée 1-72, pas de rangement) ou
-- "bac_gris" (6 rangements de 36 positions). Sert à trier l'écran de préparation des commandes du
-- local dans l'ordre physique de l'entrepôt. Nullable : les pins jamais commandés (ou le "#",
-- pas encore casé) restent sans emplacement.
alter table public.stock_pins
  add column if not exists emplacement_type text check (emplacement_type in ('boite_rouge', 'bac_gris')),
  add column if not exists emplacement_rangement integer,
  add column if not exists emplacement_numero integer;

alter table public.stock_pins drop constraint if exists stock_pins_emplacement_coherent;
alter table public.stock_pins
  add constraint stock_pins_emplacement_coherent check (
    (emplacement_type is null and emplacement_rangement is null and emplacement_numero is null)
    or (emplacement_type = 'boite_rouge' and emplacement_rangement is null
        and emplacement_numero between 1 and 72)
    or (emplacement_type = 'bac_gris' and emplacement_rangement between 1 and 6
        and emplacement_numero between 1 and 36)
  );
