-- Un alternant ne modifie plus son calendrier d'école en direct : il propose des changements
-- (plusieurs mois d'affilée possibles) regroupés en une seule demande, envoyée à l'admin qui
-- valide ou refuse en bloc. Décision explicite (cf. discussion) : évite qu'un alternant change
-- son planning école sans validation, ce qui impacterait directement la génération auto du
-- planning et les heures comptées.

create table if not exists public.demandes_calendrier_ecole (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'refusee')),
  traite_par uuid references public.profiles(id),
  traite_le timestamptz,
  created_at timestamptz not null default now()
);

-- Une seule demande en attente à la fois par alternant (cf. décision : bloqué tant que l'admin n'a
-- pas répondu, pas de demandes qui se chevauchent).
create unique index if not exists demandes_calendrier_ecole_une_en_attente
  on public.demandes_calendrier_ecole (profile_id)
  where statut = 'en_attente';

-- Les jours proposés par une demande : chacun est soit un ajout (nouveau jour d'école) soit une
-- suppression (jour d'école existant à retirer) — appliqués tous ensemble à jours_ecole_alternant
-- au moment de la validation admin (côté client, cf. useTraiterDemandeCalendrierEcole).
create table if not exists public.demandes_calendrier_ecole_jours (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.demandes_calendrier_ecole(id) on delete cascade,
  date date not null,
  action text not null check (action in ('ajout', 'suppression'))
);
create index if not exists demandes_calendrier_ecole_jours_demande_idx
  on public.demandes_calendrier_ecole_jours (demande_id);

alter table public.demandes_calendrier_ecole enable row level security;
alter table public.demandes_calendrier_ecole_jours enable row level security;

drop policy if exists "demandes_calendrier_ecole_lecture" on public.demandes_calendrier_ecole;
create policy "demandes_calendrier_ecole_lecture" on public.demandes_calendrier_ecole
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "demandes_calendrier_ecole_creation" on public.demandes_calendrier_ecole;
create policy "demandes_calendrier_ecole_creation" on public.demandes_calendrier_ecole
  for insert with check (profile_id = auth.uid() and statut = 'en_attente');

-- Seul l'admin valide/refuse (contrairement aux congés, pas de délégation manager ici) — et
-- personne ne peut s'auto-valider, y compris via un appel direct à l'API REST.
drop policy if exists "demandes_calendrier_ecole_maj_admin" on public.demandes_calendrier_ecole;
create policy "demandes_calendrier_ecole_maj_admin" on public.demandes_calendrier_ecole
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "demandes_calendrier_ecole_jours_lecture" on public.demandes_calendrier_ecole_jours;
create policy "demandes_calendrier_ecole_jours_lecture" on public.demandes_calendrier_ecole_jours
  for select using (
    exists (
      select 1 from public.demandes_calendrier_ecole d
      where d.id = demande_id and (d.profile_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "demandes_calendrier_ecole_jours_creation" on public.demandes_calendrier_ecole_jours;
create policy "demandes_calendrier_ecole_jours_creation" on public.demandes_calendrier_ecole_jours
  for insert with check (
    exists (
      select 1 from public.demandes_calendrier_ecole d
      where d.id = demande_id and d.profile_id = auth.uid()
    )
  );

-- jours_ecole_alternant : un alternant ne peut plus écrire en direct (seul l'admin, en validant
-- une demande, ou en éditant lui-même le calendrier d'un alternant depuis l'écran existant).
-- Remplace les policies de la migration 0004 plutôt que d'en ajouter (une policy supplémentaire
-- ne peut qu'élargir un droit, jamais le restreindre).
drop policy if exists "jours_ecole_ecriture" on public.jours_ecole_alternant;
create policy "jours_ecole_ecriture" on public.jours_ecole_alternant
  for insert with check (public.is_admin());

drop policy if exists "jours_ecole_maj" on public.jours_ecole_alternant;
create policy "jours_ecole_maj" on public.jours_ecole_alternant
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "jours_ecole_suppression" on public.jours_ecole_alternant;
create policy "jours_ecole_suppression" on public.jours_ecole_alternant
  for delete using (public.is_admin());
