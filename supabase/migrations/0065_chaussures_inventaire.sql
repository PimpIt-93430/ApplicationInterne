-- Nouveau modèle chaussures : "à ramener" n'est plus une quantité saisie/incrémentée à la main —
-- c'est stock de départ moins le dernier inventaire compté par le pop-up, calculé côté client
-- (cf. src/api/chaussures.ts). On remplace donc quantite_a_ramener par un vrai stock_initial, et
-- on ajoute une table d'inventaires (un enregistrement par couleur/taille à chaque comptage,
-- jamais écrasé — historique complet, contrairement à l'ancien système qui remettait tout à 0).

-- Pas de backfill depuis quantite_a_ramener : c'était un déficit ("il en manque X"), pas un
-- niveau cible — les deux ne sont pas comparables. stock_initial démarre à 0 pour tout le monde,
-- à régler à la main dans l'écran Stock.
alter table public.chaussures_stock
  add column if not exists stock_initial numeric not null default 0;

alter table public.chaussures_stock drop column if exists quantite_a_ramener;

create table if not exists public.chaussures_inventaires (
  id uuid primary key default gen_random_uuid(),
  couleur text not null check (couleur in ('Noir', 'Kaki', 'Rose', 'Gris')),
  taille text not null check (taille in ('36-37', '38-39', '40-41', '41-42', '43-44', '45-46')),
  quantite_comptee numeric not null check (quantite_comptee >= 0),
  profile_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists chaussures_inventaires_couleur_taille_idx
  on public.chaussures_inventaires (couleur, taille, created_at desc);

alter table public.chaussures_inventaires enable row level security;

drop policy if exists "chaussures_inventaires_lecture" on public.chaussures_inventaires;
create policy "chaussures_inventaires_lecture" on public.chaussures_inventaires
  for select using (auth.uid() is not null);

drop policy if exists "chaussures_inventaires_creation" on public.chaussures_inventaires;
create policy "chaussures_inventaires_creation" on public.chaussures_inventaires
  for insert with check (auth.uid() is not null and profile_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.chaussures_inventaires;
exception when duplicate_object then null;
end $$;
