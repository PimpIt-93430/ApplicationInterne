-- Cf. retour utilisateur du 2026-09-05 : "l'application Pimp It et le Hub Pimp It ne partagent pas
-- la même base de données ou quoi ? j'ai pas les mêmes quantités de pin's dans le hub et dans
-- l'app" — confirmé : hub_pins (Hub) et stock_pins (app) sont deux tables séparées depuis la
-- migration Airtable, jamais resynchronisées depuis (hub_pins.synced_at gelé). 548 pins sur 691
-- avaient un stock différent entre les deux, écarts jusqu'à 1300+ unités. stock_pins est mise à
-- jour en continu par l'app (source de vérité désignée par l'utilisateur) ; hub_pins était un
-- instantané figé. Décision : fusionner — le Hub lit/écrit désormais stock_pins directement,
-- hub_pins n'est plus utilisée par aucun code (conservée pour l'instant, pas droppée, au cas où).
--
-- Colonnes propres au Hub absentes de stock_pins, ajoutées ici + backfillées depuis hub_pins par
-- correspondance stock_pins.airtable_record_id = hub_pins.airtable_id.
alter table public.stock_pins
  add column boite text,
  add column custom boolean not null default false,
  add column pas_dans_unite boolean not null default false;

update public.stock_pins s
set boite = h.boite,
    custom = coalesce(h.custom, false),
    pas_dans_unite = coalesce(h.pas_dans_unite, false)
from public.hub_pins h
where h.airtable_id = s.airtable_record_id;

-- Le Hub utilise airtable_record_id comme identifiant stable de chaque pin (mêmes valeurs que
-- l'ancien hub_pins.airtable_id, référencées telles quelles dans hub_purchase_orders.items[] etc.)
-- — 16 pins ajoutés directement depuis l'app après la bascule Airtable n'en ont jamais eu, on leur
-- en attribue un synthétique (même convention que hub_pins.creerPin : préfixe "hub_").
update public.stock_pins
set airtable_record_id = 'hub_' || gen_random_uuid()::text
where airtable_record_id is null;
