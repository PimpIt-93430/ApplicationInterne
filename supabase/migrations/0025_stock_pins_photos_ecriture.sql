-- Le bucket "stock-pins" est public en lecture (migrations 0009, 0023) mais RLS reste actif sur
-- storage.objects par défaut : sans policy d'écriture, l'upload d'une photo depuis l'app échoue
-- silencieusement même en étant connecté. Écriture ouverte à tout utilisateur connecté, même
-- principe que stock_pins (migration 0020).
drop policy if exists "stock_pins_photos_ecriture" on storage.objects;
create policy "stock_pins_photos_ecriture" on storage.objects
  for insert
  with check (bucket_id = 'stock-pins' and auth.uid() is not null);
