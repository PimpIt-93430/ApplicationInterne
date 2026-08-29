-- Guides globaux (procédures pop-up, fonctionnement caisse, etc.) : contrairement aux documents
-- employé (personnels, admin + la personne concernée seulement), lecture ouverte à tout le monde
-- connecté — écriture réservée à l'admin. Accessibles depuis Profil > "Afficher les informations"
-- (cf. retour utilisateur du 2026-08-25).
insert into storage.buckets (id, name, public)
values ('guides', 'guides', false)
on conflict (id) do nothing;

drop policy if exists "guides_lecture" on storage.objects;
create policy "guides_lecture" on storage.objects
  for select using (bucket_id = 'guides' and auth.role() = 'authenticated');

drop policy if exists "guides_ecriture_admin" on storage.objects;
create policy "guides_ecriture_admin" on storage.objects
  for all using (bucket_id = 'guides' and public.is_admin())
  with check (bucket_id = 'guides' and public.is_admin());

create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  nom_fichier text not null,
  chemin_stockage text not null,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.guides enable row level security;

drop policy if exists "guides_lecture" on public.guides;
create policy "guides_lecture" on public.guides
  for select using (auth.uid() is not null);

drop policy if exists "guides_ecriture_admin" on public.guides;
create policy "guides_ecriture_admin" on public.guides
  for all using (public.is_admin()) with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.guides;
exception when duplicate_object then null;
end $$;
