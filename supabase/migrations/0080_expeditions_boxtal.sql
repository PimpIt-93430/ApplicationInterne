-- Suivi des étiquettes Boxtal créées depuis le Hub (cf. discussion 2026-08-28/29) : Shopify ne
-- reçoit jamais de mise à jour de statut pour ces envois (fulfillment.shipment_status reste `null`
-- même longtemps après livraison, confirmé en session sur la commande #26382 — La Poste/Boxtal ne
-- pousse pas d'événement de suivi vers Shopify pour ce compte). L'API Boxtal a en revanche un vrai
-- endpoint de suivi (`GET /shipping-order/{id}/tracking`), mais il faut l'id Boxtal de la commande
-- d'expédition, connu uniquement au moment de la création — d'où cette table, remplie par le Hub à
-- chaque création d'étiquette et rafraîchie à la demande.
create table public.expeditions_boxtal (
  id uuid primary key default gen_random_uuid(),
  commande_shopify_id bigint not null,
  commande_nom text not null,
  boxtal_shipping_order_id text not null unique,
  statut_suivi text not null default 'inconnu',
  suivi_url text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index expeditions_boxtal_commande_shopify_id_idx on public.expeditions_boxtal (commande_shopify_id);

alter table public.expeditions_boxtal enable row level security;

-- Admin-only, alignée sur le reste des données logistique/finance du Hub — pas d'écriture directe
-- côté client, tout passe par les Server Actions du Hub (clé anon + session admin, comme partout
-- ailleurs dans ce projet).
create policy "expeditions_boxtal_select_admin" on public.expeditions_boxtal
  for select using (public.is_admin());

create policy "expeditions_boxtal_insert_admin" on public.expeditions_boxtal
  for insert with check (public.is_admin());

create policy "expeditions_boxtal_update_admin" on public.expeditions_boxtal
  for update using (public.is_admin());
