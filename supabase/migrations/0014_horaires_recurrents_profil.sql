-- Remplace le système de disponibilités ponctuelles + effectifs requis par quota (jamais
-- vraiment utilisables en pratique : aucun écran ne permettait de déclarer les premières, et
-- les seconds ne collaient pas au fonctionnement réel de l'équipe) par un horaire récurrent
-- par personne : pour chaque jour de la semaine, l'heure à laquelle elle travaille par défaut
-- à son pop-up. La génération automatique du planning s'appuie désormais dessus, avec les
-- indisponibilités (table conges, déjà existante) comme seules exceptions à déclarer.

create table if not exists public.horaires_recurrents_profil (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  jour_semaine smallint not null check (jour_semaine between 0 and 6),
  heure_debut time not null,
  heure_fin time not null,
  actif boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (profile_id, jour_semaine)
);
create index if not exists horaires_recurrents_profil_profile_idx
  on public.horaires_recurrents_profil (profile_id);

alter table public.horaires_recurrents_profil enable row level security;

drop policy if exists "horaires_recurrents_lecture" on public.horaires_recurrents_profil;
create policy "horaires_recurrents_lecture" on public.horaires_recurrents_profil
  for select using (auth.uid() is not null);

drop policy if exists "horaires_recurrents_ecriture_admin" on public.horaires_recurrents_profil;
create policy "horaires_recurrents_ecriture_admin" on public.horaires_recurrents_profil
  for all using (public.is_admin()) with check (public.is_admin());

drop table if exists public.disponibilites;
drop table if exists public.regles_effectifs_creneau;

-- Plafond d'heures hebdomadaire par défaut : jamais exposé dans aucun écran, et la génération
-- déterministe par horaire récurrent n'en a plus besoin (l'horaire de chacun est fixé à la main).
drop table if exists public.regles_globales;
