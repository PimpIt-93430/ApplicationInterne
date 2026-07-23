-- Correction en masse demandée par l'utilisateur : seuil cible par défaut remis à 100 pour tous
-- les pins, sauf les pins dorés/roses/argent (moins prioritaires) qui restent à 50.
update public.stock_pins set seuil_cible = 100;

update public.stock_pins
set seuil_cible = 50
where nom ilike '%doré%' or nom ilike '%dore%' or nom ilike '%rose%' or nom ilike '%argent%';
