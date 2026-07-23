-- Historique des commandes (qui a été commandé, quand, trouvé ou pas au moment de valider une
-- commande reçue) + ajustement automatique hebdomadaire du seuil cible : un pin trouvé/commandé
-- dans les 7 derniers jours voit son seuil monter de 15%, sinon il descend de 15% (plancher à 5).
-- Fait converger les seuils vers la demande réelle au fil des mois, sans réglage manuel.

create table if not exists public.commandes_historique (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references public.pop_ups (id) on delete cascade,
  pin_id uuid not null references public.stock_pins (id) on delete cascade,
  trouve boolean not null,
  profile_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists commandes_historique_pin_idx on public.commandes_historique (pin_id, created_at desc);
create index if not exists commandes_historique_popup_idx on public.commandes_historique (pop_up_id, created_at desc);

alter table public.commandes_historique enable row level security;

drop policy if exists "commandes_historique_lecture" on public.commandes_historique;
create policy "commandes_historique_lecture" on public.commandes_historique
  for select using (auth.uid() is not null);

-- Même gating que l'écran "Voir la commande" (admin uniquement côté UI) : seul un admin peut
-- valider une commande reçue, donc seul un admin peut écrire dans cet historique.
drop policy if exists "commandes_historique_insertion" on public.commandes_historique;
create policy "commandes_historique_insertion" on public.commandes_historique
  for insert with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime add table public.commandes_historique;
exception when duplicate_object then null;
end $$;

-- Ajustement automatique : ignore les pins sans seuil déjà réglé à la main (rien à faire
-- converger tant qu'il n'y a pas de point de départ humain).
create or replace function public.ajuster_seuils_cibles()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stock_pins sp
  set seuil_cible = greatest(5, round(sp.seuil_cible * 1.15)),
      updated_at = now()
  where sp.seuil_cible is not null
    and exists (
      select 1 from public.commandes_historique ch
      where ch.pin_id = sp.id and ch.trouve = true and ch.created_at > now() - interval '7 days'
    );

  update public.stock_pins sp
  set seuil_cible = greatest(5, round(sp.seuil_cible * 0.85)),
      updated_at = now()
  where sp.seuil_cible is not null
    and not exists (
      select 1 from public.commandes_historique ch
      where ch.pin_id = sp.id and ch.trouve = true and ch.created_at > now() - interval '7 days'
    );
end;
$$;

-- Si cette ligne échoue ("extension pg_cron is not available"), active l'extension "pg_cron"
-- depuis le Dashboard Supabase (Database > Extensions) avant de relancer cette migration.
create extension if not exists pg_cron;

select cron.schedule(
  'ajuster-seuils-hebdo',
  '0 6 * * 1',
  $$select public.ajuster_seuils_cibles();$$
);
