-- Bug : la création d'une demande échouait silencieusement quand un admin teste depuis la
-- prévisualisation "vue alternant" (Profil) — auth.uid() reste celui de l'admin dans ce cas (la
-- prévisualisation est purement visuelle, pas une vraie session alternant), donc `profile_id =
-- auth.uid()` était toujours faux et l'insert rejeté par RLS sans qu'aucune erreur ne remonte à
-- l'écran. Même convention que conges_ecriture (migration 0034) : ajoute le bypass admin manquant.
drop policy if exists "demandes_calendrier_ecole_creation" on public.demandes_calendrier_ecole;
create policy "demandes_calendrier_ecole_creation" on public.demandes_calendrier_ecole
  for insert with check ((profile_id = auth.uid() or public.is_admin()) and statut = 'en_attente');

drop policy if exists "demandes_calendrier_ecole_jours_creation" on public.demandes_calendrier_ecole_jours;
create policy "demandes_calendrier_ecole_jours_creation" on public.demandes_calendrier_ecole_jours
  for insert with check (
    exists (
      select 1 from public.demandes_calendrier_ecole d
      where d.id = demande_id and (d.profile_id = auth.uid() or public.is_admin())
    )
  );
