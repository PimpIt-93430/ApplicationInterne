-- Retour utilisateur du 2026-10-27 : nouveau type d'absence "maladie", posé depuis le planning du
-- Hub et compté à part dans l'export comptable (colonnes "Jours maladie" / "Dates maladie").
alter table public.conges drop constraint conges_type_check;
alter table public.conges add constraint conges_type_check
  check (type = any (array['conge', 'indisponibilite', 'absence', 'repos', 'maladie']));
