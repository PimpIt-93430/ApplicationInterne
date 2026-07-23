-- Fiches employé détaillées (écran Équipe web) : informations RH sensibles séparées de
-- `profiles` (qui est lisible par n'importe quel utilisateur connecté, cf. policy
-- "profils_lecture" dans 0002_rls_policies.sql) pour que l'IBAN, le numéro de sécu et les
-- informations médicales ne soient visibles que par l'admin et la personne concernée.

create table if not exists public.informations_rh (
  profile_id uuid primary key references public.profiles (id) on delete cascade,

  -- Identité
  genre text,
  nationalite text,
  date_naissance date,
  pays_naissance text,
  departement_naissance text,
  commune_naissance text,
  situation_familiale text,
  nombre_personnes_charge int,

  -- Coordonnées
  tel_mobile text,
  tel_fixe text,
  notifications_sms boolean not null default false,
  adresse text,
  complement_adresse text,
  code_postal text,
  ville text,
  pays text,

  -- Contact d'urgence
  contact_urgence_prenom text,
  contact_urgence_nom text,
  contact_urgence_lien text,
  contact_urgence_tel_mobile text,
  contact_urgence_tel_fixe text,

  -- Bancaire
  nom_titulaire_compte text,
  iban text,
  bic text,

  -- Médical
  numero_secu text,
  handicap boolean not null default false,
  type_handicap text,
  date_derniere_visite_medicale date,
  visite_medicale_renforcee boolean not null default false,
  prochaine_visite_medicale date,

  -- Contrat (complète type_contrat/heures_max_semaine déjà sur profiles)
  matricule text,
  date_debut_contrat date,
  heure_debut_contrat time,
  responsable_hierarchique_id uuid references public.profiles (id) on delete set null,
  etablissement_par_defaut_id uuid references public.pop_ups (id) on delete set null,

  -- Autorisations
  travailleur_etranger boolean not null default false,
  autorisation_travail text,

  updated_at timestamptz not null default now()
);

create or replace function public.touch_informations_rh_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_informations_rh_update on public.informations_rh;
create trigger before_informations_rh_update
  before update on public.informations_rh
  for each row execute function public.touch_informations_rh_updated_at();

alter table public.informations_rh enable row level security;

drop policy if exists "informations_rh_lecture" on public.informations_rh;
create policy "informations_rh_lecture" on public.informations_rh
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "informations_rh_ecriture_admin" on public.informations_rh;
create policy "informations_rh_ecriture_admin" on public.informations_rh
  for all using (public.is_admin()) with check (public.is_admin());

-- Documents employé : bucket privé (contrairement à stock-pins qui est public), accès admin
-- uniquement pour l'instant.
insert into storage.buckets (id, name, public)
values ('documents-employes', 'documents-employes', false)
on conflict (id) do nothing;

drop policy if exists "documents_employes_admin" on storage.objects;
create policy "documents_employes_admin" on storage.objects
  for all using (bucket_id = 'documents-employes' and public.is_admin())
  with check (bucket_id = 'documents-employes' and public.is_admin());

create table if not exists public.documents_employe (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  nom_fichier text not null,
  chemin_stockage text not null,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists documents_employe_profile_idx on public.documents_employe (profile_id);

alter table public.documents_employe enable row level security;

drop policy if exists "documents_employe_admin" on public.documents_employe;
create policy "documents_employe_admin" on public.documents_employe
  for all using (public.is_admin()) with check (public.is_admin());
