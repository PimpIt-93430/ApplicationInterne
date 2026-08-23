-- Le comptage d'inventaire chaussures devient propre à chaque pop-up (le stock visé, lui, reste
-- volontairement unique et partagé — décision explicite : un seul stock_initial pour tout le
-- monde, cf. chaussures_stock, pas de colonne pop_up_id dessus). Chaque lieu compte et voit donc
-- désormais son propre historique de comptages et son propre "à ramener".

-- Table encore vide (fonctionnalité tout juste posée en 0065) : pas de backfill nécessaire, on
-- peut ajouter la colonne directement en not null.
alter table public.chaussures_inventaires
  add column pop_up_id uuid not null references public.pop_ups (id) on delete cascade;

drop index if exists chaussures_inventaires_couleur_taille_idx;
create index if not exists chaussures_inventaires_popup_couleur_taille_idx
  on public.chaussures_inventaires (pop_up_id, couleur, taille, created_at desc);

-- Écriture : l'admin, ou une personne attribuée à ce pop-up précisément (même principe que les
-- commandes de consommables/pin's, cf. migration 0043) — jusqu'ici n'importe quel compte connecté
-- pouvait insérer un comptage pour n'importe quel pop-up, plus de sens maintenant que chaque
-- inventaire est rattaché à un lieu précis.
drop policy if exists "chaussures_inventaires_creation" on public.chaussures_inventaires;
create policy "chaussures_inventaires_creation" on public.chaussures_inventaires
  for insert with check (
    auth.uid() is not null
    and profile_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.profil_pop_ups
        where profile_id = auth.uid() and pop_up_id = chaussures_inventaires.pop_up_id
      )
    )
  );
