-- Écran "Ventes" (managers) : encaissement en espèces déclaré manuellement, distinct des ventes
-- carte SumUp synchronisées automatiquement (cf. ventes_sumup, migration 0033). Une vente annulée
-- n'est jamais supprimée : elle reste visible (barrée/grisée côté UI), avec qui l'a annulée et
-- quand, pour garder un historique complet consultable par l'admin.
create table if not exists public.ventes_especes (
  id uuid primary key default gen_random_uuid(),
  pop_up_id uuid not null references public.pop_ups (id),
  profile_id uuid not null references public.profiles (id),
  montant numeric not null check (montant > 0),
  statut text not null default 'confirmee' check (statut in ('confirmee', 'annulee')),
  annule_par uuid references public.profiles (id),
  annule_le timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ventes_especes_popup_idx on public.ventes_especes (pop_up_id, created_at desc);

alter table public.ventes_especes enable row level security;

-- Lecture/insertion réservées aux personnes attribuées au pop-up concerné (même logique que le
-- stock, cf. profil_pop_ups) — pas de droit dédié : l'écran "Ventes" n'est de toute façon exposé
-- côté UI qu'aux managers.
drop policy if exists "ventes_especes_lecture" on public.ventes_especes;
create policy "ventes_especes_lecture" on public.ventes_especes
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups pp
      where pp.profile_id = auth.uid() and pp.pop_up_id = ventes_especes.pop_up_id
    )
  );

drop policy if exists "ventes_especes_ecriture" on public.ventes_especes;
create policy "ventes_especes_ecriture" on public.ventes_especes
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.profil_pop_ups pp
      where pp.profile_id = auth.uid() and pp.pop_up_id = ventes_especes.pop_up_id
    )
  );

-- Annulation = simple bascule de statut, jamais une suppression (aucune policy "delete" : même
-- l'admin ne peut pas effacer une vente via l'API). Le trigger ci-dessous verrouille tout le reste
-- (montant/pop-up/auteur immuables) et empêche de revenir en arrière une fois annulée.
drop policy if exists "ventes_especes_annulation" on public.ventes_especes;
create policy "ventes_especes_annulation" on public.ventes_especes
  for update using (
    public.is_admin()
    or exists (
      select 1 from public.profil_pop_ups pp
      where pp.profile_id = auth.uid() and pp.pop_up_id = ventes_especes.pop_up_id
    )
  )
  with check (true);

create or replace function public.proteger_ventes_especes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.montant := old.montant;
  new.pop_up_id := old.pop_up_id;
  new.profile_id := old.profile_id;
  new.created_at := old.created_at;

  if old.statut = 'annulee' then
    new.statut := old.statut;
    new.annule_par := old.annule_par;
    new.annule_le := old.annule_le;
  elsif new.statut = 'annulee' then
    new.annule_par := auth.uid();
    new.annule_le := now();
  else
    new.statut := old.statut;
    new.annule_par := old.annule_par;
    new.annule_le := old.annule_le;
  end if;

  return new;
end;
$$;

drop trigger if exists before_ventes_especes_update_proteger on public.ventes_especes;
create trigger before_ventes_especes_update_proteger
  before update on public.ventes_especes
  for each row execute function public.proteger_ventes_especes();
