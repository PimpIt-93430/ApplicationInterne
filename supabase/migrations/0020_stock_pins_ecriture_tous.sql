-- Gestion du stock désormais identique pour tout le monde (alternants inclus), pas réservée aux
-- admins : créer un pin, éditer son seuil cible, ajuster le stock général. Compter les boîtes
-- (pop_up_pin_boites, stock_mouvements) était déjà ouvert à qui est attribué au pop-up ; seule
-- l'écriture sur le catalogue partagé (stock_pins) restait verrouillée à is_admin().
drop policy if exists "stock_pins_ecriture_admin" on public.stock_pins;
create policy "stock_pins_ecriture" on public.stock_pins
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
