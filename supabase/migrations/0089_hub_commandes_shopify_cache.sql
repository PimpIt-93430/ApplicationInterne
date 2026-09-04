-- Cache Supabase pour l'écran "Commandes Shopify" du Hub (cf. app/(hub)/commandes-shopify/page.tsx
-- dans Pimp It Hub) : jusqu'ici cet écran refaisait un appel Shopify complet (200 commandes) à
-- chaque visite, sans cache — gros contributeur de latence identifié lors de l'audit du
-- 2026-09-02. Nouveau fonctionnement : seules les commandes PAS ENCORE livrées restent en cache
-- (retour utilisateur explicite : "une fois que c'est livré tu la sors du cache, pas besoin de
-- garder en mémoire") ; à chaque visite, on ne redemande à Shopify que ce qui a changé depuis la
-- dernière synchro (avec une marge de sécurité d'une minute pour ne rien manquer), pas les 200
-- commandes en entier.
create table public.hub_commandes_shopify_cache (
  shopify_id bigint primary key,
  nom text not null,
  cree_le timestamptz not null,
  client text not null,
  email text,
  statut_paiement text,
  statut_expedition text not null,
  statut_expedition_brut text,
  total_prix numeric not null,
  devise text not null,
  adresse text,
  adresse_livraison jsonb,
  moyen_expedition text,
  lignes jsonb not null default '[]'::jsonb,
  fulfillments jsonb not null default '[]'::jsonb,
  shopify_updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create index hub_commandes_shopify_cache_cree_le_idx on public.hub_commandes_shopify_cache (cree_le desc);

alter table public.hub_commandes_shopify_cache enable row level security;

create policy "hub_commandes_shopify_cache_admin" on public.hub_commandes_shopify_cache
  for all using (public.is_admin()) with check (public.is_admin());

-- Curseur de synchro incrémentale (singleton, même pattern que ventes_sumup_sync_etat).
create table public.hub_commandes_shopify_sync_etat (
  id boolean primary key default true,
  derniere_synchro_le timestamptz,
  ok boolean not null default true,
  message text,
  constraint hub_commandes_shopify_sync_etat_singleton check (id)
);

insert into public.hub_commandes_shopify_sync_etat (id, derniere_synchro_le, ok, message)
values (true, null, true, 'Jamais synchronisé — premier chargement fera un backfill complet');

alter table public.hub_commandes_shopify_sync_etat enable row level security;

create policy "hub_commandes_shopify_sync_etat_admin" on public.hub_commandes_shopify_sync_etat
  for all using (public.is_admin()) with check (public.is_admin());
