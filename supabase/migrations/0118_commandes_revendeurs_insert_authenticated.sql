-- Bug réel trouvé le 2026-09-17 : la page /revendeurs est publique (pas besoin de compte), mais
-- si la personne qui l'ouvre est PAR AILLEURS connectée au Hub dans le même navigateur (typiquement
-- l'admin qui teste sa propre page), sa requête passe avec le rôle `authenticated`, pas `anon` —
-- or seule la policy insert pour `anon` existait. Un vrai revendeur externe (jamais connecté)
-- n'aurait pas ce problème, mais quiconque au Hub testant la page depuis son propre navigateur si.
create policy commandes_revendeurs_insert_authenticated on commandes_revendeurs
  for insert to authenticated with check (true);
create policy commandes_revendeurs_lignes_insert_authenticated on commandes_revendeurs_lignes
  for insert to authenticated with check (true);
