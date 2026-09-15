-- Cf. retour utilisateur du 2026-09-15 : nouvel écran mobile (App PIMP IT > Profil > admin) qui
-- calcule automatiquement le montant attendu (SumUp + espèces appli) et le montant compté, plutôt
-- que de ne saisir que l'écart calculé à la main comme le fait aujourd'hui le Hub (app/(hub)/trou).
-- `montant` reste l'écart (compté - attendu), pour ne rien casser côté Hub — ces deux colonnes sont
-- juste le détail du calcul quand il est disponible (nulles pour les trous saisis à la main, comme
-- avant cette migration).
alter table trous_caisse
  add column montant_compte numeric,
  add column montant_attendu numeric;
