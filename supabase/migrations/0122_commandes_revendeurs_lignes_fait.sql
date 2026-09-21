-- Retour utilisateur du 2026-09-21 : la commande revendeur (ex. MACADAM) doit aussi apparaître
-- dans "Voir la commande" du local sur l'appli, avec le même workflow de préparation que les
-- commandes pop-up (coche pin par pin trouvé/pas trouvé, cf. commande_lignes.fait). Aucune
-- politique UPDATE n'existait sur commandes_revendeurs_lignes (seulement INSERT/SELECT) puisque
-- rien ne l'écrivait jusqu'ici après création.

alter table commandes_revendeurs_lignes add column fait boolean not null default false;

create policy "commandes_revendeurs_lignes_maj_staff" on commandes_revendeurs_lignes
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

do $$
begin
  alter publication supabase_realtime add table public.commandes_revendeurs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.commandes_revendeurs_lignes;
exception when duplicate_object then null;
end $$;
