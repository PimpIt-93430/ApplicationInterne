-- Écran Finance (SumUp) : coordonnées GPS d'un pop-up (pour retrouver quel lieu a fait une vente,
-- cf. absence de champ fiable côté API SumUp pour ça — la seule donnée de localisation exploitable
-- est le lat/lon pris par le téléphone au moment de la vente, à comparer à la position du pop-up),
-- email SumUp d'un salarié (pour l'attribution) et table des ventes synchronisées.
alter table public.pop_ups
  add column if not exists lat numeric,
  add column if not exists lon numeric;

-- Sur informations_rh, pas sur profiles : profiles est lisible par tous les employés connectés
-- (profils_lecture: auth.uid() is not null) et modifiable par son propriétaire (profils_maj: id =
-- auth.uid() or is_admin()) — un champ qui pilote l'attribution financière ne doit être ni lisible
-- ni modifiable par un simple employé. informations_rh a déjà la bonne RLS (lecture réservée au
-- propriétaire ou admin, écriture admin uniquement).
alter table public.informations_rh
  add column if not exists sumup_email text unique;

create table if not exists public.ventes_sumup (
  id uuid primary key default gen_random_uuid(),
  sumup_transaction_id text unique not null,
  pop_up_id uuid references public.pop_ups (id),
  profile_id uuid references public.profiles (id),
  montant numeric not null,
  devise text not null default 'EUR',
  frais_montant numeric,
  pourboire_montant numeric,
  statut text not null,
  moyen_paiement text,
  horodatage timestamptz not null,
  -- Coordonnées brutes + distance au pop-up retenu, gardées pour audit (permet de vérifier a
  -- posteriori que l'attribution automatique par proximité GPS a un sens).
  lat numeric,
  lon numeric,
  distance_pop_up_metres numeric,
  -- Email SumUp brut de la vente, gardé même quand non résolu à un profil connu : permet un
  -- rattachement rétroactif (une fois l'email mappé dans informations_rh) sans re-solliciter l'API.
  sumup_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ventes_sumup_horodatage_idx on public.ventes_sumup (horodatage desc);
create index if not exists ventes_sumup_popup_idx on public.ventes_sumup (pop_up_id);
create index if not exists ventes_sumup_profile_idx on public.ventes_sumup (profile_id);

alter table public.ventes_sumup enable row level security;

drop policy if exists "ventes_sumup_admin" on public.ventes_sumup;
create policy "ventes_sumup_admin" on public.ventes_sumup
  for all using (public.is_admin()) with check (public.is_admin());
