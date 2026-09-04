-- Suivi des dépôts en banque du cash SumUp ("Espèce SumUp", cf. FinanceEcran.tsx) : pour une
-- période choisie (jour X à jour Y inclus), l'admin voit le montant SumUp encaissé en espèces à
-- déposer (tous pop-up confondus — retour utilisateur : "il faut pas de sélecteur de pop up c'est
-- tous les popup"), puis enregistre le dépôt réellement effectué (jour du dépôt, période couverte,
-- montant) — réservé aux admins (retour utilisateur du 2026-09-01, nouvel onglet dans Profil).
create table if not exists public.depots_especes (
  id uuid primary key default gen_random_uuid(),
  periode_debut date not null,
  periode_fin date not null,
  date_depot date not null,
  montant numeric not null check (montant > 0),
  profile_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint depots_especes_periode_valide check (periode_fin >= periode_debut)
);

create index if not exists depots_especes_periode_idx on public.depots_especes (periode_debut desc);

alter table public.depots_especes enable row level security;

drop policy if exists "depots_especes_lecture" on public.depots_especes;
create policy "depots_especes_lecture" on public.depots_especes
  for select using (public.is_admin());

drop policy if exists "depots_especes_ecriture" on public.depots_especes;
create policy "depots_especes_ecriture" on public.depots_especes
  for insert with check (public.is_admin() and profile_id = auth.uid());

drop policy if exists "depots_especes_modification" on public.depots_especes;
create policy "depots_especes_modification" on public.depots_especes
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "depots_especes_suppression" on public.depots_especes;
create policy "depots_especes_suppression" on public.depots_especes
  for delete using (public.is_admin());
