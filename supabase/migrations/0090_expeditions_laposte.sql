-- Suivi des étiquettes La Poste créées depuis le Hub (cf. lib/laposte.ts, API Postage — Lettre
-- Verte/Performance Suivie, produits classés "léger") — remplace Sendcloud pour ces commandes-là,
-- retour utilisateur du 2026-09-02. Contrairement à Sendcloud, l'API La Poste n'a pas d'endpoint
-- pour retélécharger l'étiquette après coup : le PDF (visual_output_base64) est conservé ici tel
-- que reçu à la création, seule copie disponible pour la rouvrir plus tard.
--
-- Compte de RECETTE (postageExternal) pour l'instant : ces étiquettes sont fictives, pas de vrais
-- envois facturés tant que le passage en production n'a pas été demandé à La Poste.
create table public.expeditions_laposte (
  id uuid primary key default gen_random_uuid(),
  commande_shopify_id bigint not null,
  commande_nom text not null,
  laposte_order_id text not null,
  laposte_item_id text not null unique,
  item_label text not null,
  visual_output_base64 text not null,
  produit text not null,
  statut text not null default 'cree' check (statut in ('cree', 'annulee')),
  fulfillment_shopify_id text,
  cree_le timestamptz not null default now(),
  annulee_le timestamptz
);

create index expeditions_laposte_commande_shopify_id_idx on public.expeditions_laposte (commande_shopify_id);

alter table public.expeditions_laposte enable row level security;

create policy "expeditions_laposte_select_admin" on public.expeditions_laposte
  for select using (public.is_admin());

create policy "expeditions_laposte_insert_admin" on public.expeditions_laposte
  for insert with check (public.is_admin());

create policy "expeditions_laposte_update_admin" on public.expeditions_laposte
  for update using (public.is_admin());
