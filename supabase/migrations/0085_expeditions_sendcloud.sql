-- Suivi des étiquettes Sendcloud créées depuis le Hub (cf. discussion 2026-08-29 : migration
-- Boxtal → Sendcloud, "et plus de boxtal") — remplace expeditions_boxtal (conservée telle quelle,
-- historique réel non effacé, juste plus alimentée). Même raison d'être : Shopify ne reçoit jamais
-- de mise à jour de statut pour ces envois, donc on interroge directement le suivi Sendcloud
-- (GET /shipments/{id}) pour les étiquettes créées par cet outil, table remplie à la création et
-- rafraîchie à la demande/par cron.
create table public.expeditions_sendcloud (
  id uuid primary key default gen_random_uuid(),
  commande_shopify_id bigint not null,
  commande_nom text not null,
  sendcloud_shipment_id text not null unique,
  statut_suivi text not null default 'inconnu',
  suivi_url text,
  fulfillment_shopify_id text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index expeditions_sendcloud_commande_shopify_id_idx on public.expeditions_sendcloud (commande_shopify_id);

alter table public.expeditions_sendcloud enable row level security;

create policy "expeditions_sendcloud_select_admin" on public.expeditions_sendcloud
  for select using (public.is_admin());

create policy "expeditions_sendcloud_insert_admin" on public.expeditions_sendcloud
  for insert with check (public.is_admin());

create policy "expeditions_sendcloud_update_admin" on public.expeditions_sendcloud
  for update using (public.is_admin());
