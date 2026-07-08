-- RLS pour les nouvelles tables de l'extension multi pop-up.
-- Réutilise la fonction public.is_admin() créée en 0002_rls_policies.sql.

alter table public.pop_ups enable row level security;
alter table public.conges enable row level security;
alter table public.jours_ecole_alternant enable row level security;
alter table public.notifications enable row level security;

-- pop_ups : lecture pour tous les utilisateurs connectés, écriture admin only
drop policy if exists "pop_ups_lecture" on public.pop_ups;
create policy "pop_ups_lecture" on public.pop_ups
  for select using (auth.uid() is not null);

drop policy if exists "pop_ups_ecriture" on public.pop_ups;
create policy "pop_ups_ecriture" on public.pop_ups
  for all using (public.is_admin()) with check (public.is_admin());

-- conges : un employé gère ses propres congés, l'admin gère tout
drop policy if exists "conges_lecture" on public.conges;
create policy "conges_lecture" on public.conges
  for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "conges_ecriture" on public.conges;
create policy "conges_ecriture" on public.conges
  for insert with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "conges_maj" on public.conges;
create policy "conges_maj" on public.conges
  for update using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "conges_suppression" on public.conges;
create policy "conges_suppression" on public.conges
  for delete using (profile_id = auth.uid() or public.is_admin());

-- jours_ecole_alternant : lecture pour tous connectés (nécessaire à l'algo de génération),
-- écriture par l'alternant lui-même ou l'admin
drop policy if exists "jours_ecole_lecture" on public.jours_ecole_alternant;
create policy "jours_ecole_lecture" on public.jours_ecole_alternant
  for select using (auth.uid() is not null);

drop policy if exists "jours_ecole_ecriture" on public.jours_ecole_alternant;
create policy "jours_ecole_ecriture" on public.jours_ecole_alternant
  for insert with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "jours_ecole_maj" on public.jours_ecole_alternant;
create policy "jours_ecole_maj" on public.jours_ecole_alternant
  for update using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "jours_ecole_suppression" on public.jours_ecole_alternant;
create policy "jours_ecole_suppression" on public.jours_ecole_alternant
  for delete using (profile_id = auth.uid() or public.is_admin());

-- notifications : chacun ne voit/marque comme lu que les siennes ; seul l'admin en crée
drop policy if exists "notifications_lecture" on public.notifications;
create policy "notifications_lecture" on public.notifications
  for select using (profile_id = auth.uid());

drop policy if exists "notifications_maj" on public.notifications;
create policy "notifications_maj" on public.notifications
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "notifications_ecriture_admin" on public.notifications;
create policy "notifications_ecriture_admin" on public.notifications
  for insert with check (public.is_admin());

-- Realtime sur les nouvelles tables consultées en direct
do $$
begin
  alter publication supabase_realtime add table public.conges;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.jours_ecole_alternant;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
