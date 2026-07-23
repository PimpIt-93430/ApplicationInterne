-- Étiquette libre sur un créneau (ex. "Ouverture", "Fermeture", "Caisse"...), affichée sur les
-- blocs de créneau dans les nouvelles vues calendrier admin (web). Liste fixe côté client pour
-- l'instant (pas d'écran de gestion des étiquettes) — colonne texte nullable, additive.
alter table public.planning_shifts add column if not exists etiquette text;
