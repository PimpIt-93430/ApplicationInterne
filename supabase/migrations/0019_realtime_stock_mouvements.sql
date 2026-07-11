-- Quand un alternant compte une boîte sur son pop-up, l'admin doit le voir apparaître dans le
-- Rapport sans avoir à rouvrir l'écran Stock : il manquait l'abonnement temps réel côté app (déjà
-- en place pour le planning) ET la table stock_mouvements n'était même pas publiée en realtime
-- (seule pop_up_pin_boites l'était, cf. migration 0008).
do $$
begin
  alter publication supabase_realtime add table public.stock_mouvements;
exception when duplicate_object then null;
end $$;
