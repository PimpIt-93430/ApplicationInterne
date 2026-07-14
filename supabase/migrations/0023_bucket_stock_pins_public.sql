-- Toutes les photos de pins ont cessé de charger d'un coup (pas juste certaines) : ça pointe vers
-- le bucket "stock-pins" lui-même plutôt que vers des URLs individuelles cassées — un bucket
-- Storage servi en public bypass les policies RLS de storage.objects via l'endpoint public, mais
-- seulement tant que sa colonne `public` reste à true. La migration 0009 ne le posait qu'à la
-- création (`on conflict do nothing`) : si ce flag a été repassé à false depuis (dashboard, reset
-- de projet...), rien ne le remettait. Update explicite, sans condition, pour le forcer à nouveau.
update storage.buckets set public = true where id = 'stock-pins';
