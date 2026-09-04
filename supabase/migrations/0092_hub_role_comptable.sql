-- Accès Hub restreint en lecture seule (Planning uniquement) — pour un comptable externe qui gère
-- la paie et a besoin de voir le planning de toute l'équipe sans repasser par un export, cf. retour
-- utilisateur du 2026-09-04 : "il faudrait que je lui donne un lien où il peut voir le planing de
-- tous le monde". Indépendant de `role`/`type_contrat` (qui pilotent la paie/le planning côté app
-- mobile) : un comptable garde `role='employe'` classique, ce flag ne fait qu'ajouter un accès Hub
-- séparé, réservé au rôle Hub `comptable` (cf. lib/roles.ts côté Pimp It Hub).
alter table public.profiles
  add column hub_role_comptable boolean not null default false;
