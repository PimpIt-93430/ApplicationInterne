-- Pause de l'ajustement automatique hebdomadaire des seuils (migration 0029) : trop tôt pour
-- laisser l'algorithme converger tout seul sans historique suffisant (une seule semaine de recul
-- au moment de cette pause). Remet à zéro la seule vraie semaine de dérive déjà appliquée (43/58 →
-- 50, 85/115 → 100) et désactive le cron — à reprendre manuellement plus tard, une fois qu'on aura
-- assez d'historique de commandes pour juger si l'ajustement automatique est pertinent.

update public.stock_pins set seuil_cible = 50, updated_at = now() where seuil_cible in (43, 58);
update public.stock_pins set seuil_cible = 100, updated_at = now() where seuil_cible in (85, 115);

select cron.unschedule('ajuster-seuils-hebdo');
