-- Règles de livraison (cf. retour utilisateur du 2026-09-14 : "je viens de me connecter sur le hub
-- avec un autre ordinateur mais je n'ai plus aucune règle de livraison, il faut que celle que j'ai
-- mis pour moi sur cet ordinateur soit les mêmes règles pour tous les profils et tous les
-- ordinateurs") — jusqu'ici stockées uniquement dans localStorage (Pimp It Hub, lib/regles-livraison.ts),
-- propres à un seul navigateur. id en text (pas uuid) : généré côté client (regle-<timestamp>-...),
-- pas la peine de faire re-générer un uuid partout pour ça.
create table regles_livraison (
  id text primary key,
  moyen_expedition text not null,
  poids text not null check (poids = any (array['leger','lourd','tous'])),
  destination text not null check (destination = any (array['france','international','tous'])),
  transporteur text not null check (transporteur = any (array['laposte','sendcloud'])),
  code text not null default '',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table regles_livraison enable row level security;
create policy regles_livraison_lecture on regles_livraison for select using (auth.uid() is not null);
create policy regles_livraison_ecriture on regles_livraison for all using (auth.uid() is not null) with check (auth.uid() is not null);
