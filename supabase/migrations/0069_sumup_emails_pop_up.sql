-- Attribution directe d'une adresse email SumUp à un pop-up (indépendant de sumup_email sur
-- informations_rh, qui associe un email à une PERSONNE — celui-ci associe un email à un LIEU).
-- Utile pour attribuer une vente sans dépendre du GPS (moins fiable/pas toujours renseigné) : la
-- passe de réattribution de sync-ventes-sumup consulte cette table en priorité, avant le calcul
-- par proximité GPS.
create table if not exists public.sumup_emails_pop_up (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sumup_emails_pop_up enable row level security;

-- Admin uniquement, lecture et écriture : même sensibilité que sumup_email sur informations_rh
-- (pilote l'attribution financière), pas de raison d'être plus permissif ici.
drop policy if exists "sumup_emails_pop_up_admin" on public.sumup_emails_pop_up;
create policy "sumup_emails_pop_up_admin" on public.sumup_emails_pop_up
  for all using (public.is_admin()) with check (public.is_admin());
