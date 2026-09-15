-- Cf. retour utilisateur du 2026-09-15 : "Trou de caisse" devient un tableau qui demande tout
-- seul le montant de chaque (pop-up, jour terminé) jamais rempli depuis le 8 septembre — "si le 11
-- Val d'Europe je ne veux pas remplir, j'ai la possibilité de supprimer la case" : marqueur simple
-- pour qu'une case délibérément ignorée ne réapparaisse jamais dans la liste d'attente (sans créer
-- de faux historique de trou de caisse).
create table trous_caisse_ignores (
  pop_up_id uuid not null references pop_ups(id) on delete cascade,
  date date not null,
  ignore_par uuid not null references profiles(id),
  ignore_le timestamptz not null default now(),
  primary key (pop_up_id, date)
);

alter table trous_caisse_ignores enable row level security;

create policy trous_caisse_ignores_admin on trous_caisse_ignores
  for all using (is_admin()) with check (is_admin());
