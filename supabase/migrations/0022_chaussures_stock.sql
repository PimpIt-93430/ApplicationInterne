-- Stock des chaussures : 4 couleurs x 6 tailles fixes, pas de comptage/pesée comme les pin's —
-- juste une quantité "à ramener" par couleur/taille, saisie directement par qui en a besoin, et
-- une validation qui remet tout à 0 une fois le réapprovisionnement fait (même principe que la
-- validation de réappro des pin's, mais sans historique : pas de notion de "compté", juste "il en
-- faut X"). Pas de rattachement à un pop-up pour l'instant, un seul stock partagé.
create table if not exists public.chaussures_stock (
  id uuid primary key default gen_random_uuid(),
  couleur text not null check (couleur in ('Noir', 'Kaki', 'Rose', 'Gris')),
  taille text not null check (taille in ('36-37', '38-39', '40-41', '41-42', '43-44', '45-46')),
  quantite_a_ramener numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (couleur, taille)
);

alter table public.chaussures_stock enable row level security;

drop policy if exists "chaussures_stock_lecture" on public.chaussures_stock;
create policy "chaussures_stock_lecture" on public.chaussures_stock
  for select using (auth.uid() is not null);

drop policy if exists "chaussures_stock_ecriture" on public.chaussures_stock;
create policy "chaussures_stock_ecriture" on public.chaussures_stock
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

insert into public.chaussures_stock (couleur, taille)
select c.couleur, t.taille
from unnest(array['Noir', 'Kaki', 'Rose', 'Gris']) as c(couleur)
cross join unnest(array['36-37', '38-39', '40-41', '41-42', '43-44', '45-46']) as t(taille)
on conflict (couleur, taille) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.chaussures_stock;
exception when duplicate_object then null;
end $$;
