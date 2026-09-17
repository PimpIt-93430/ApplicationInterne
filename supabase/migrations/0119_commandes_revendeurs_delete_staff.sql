-- Retour utilisateur du 2026-09-17 : pouvoir supprimer une commande revendeur depuis le Hub.
create policy commandes_revendeurs_suppression_staff on commandes_revendeurs
  for delete to authenticated using (auth.uid() is not null);
