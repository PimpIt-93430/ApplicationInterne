-- Workflow de statut sur les congés : une "demande de congé" (type='conge') passée par un employé
-- démarre "en_attente" et attend une validation manager/admin (l'écran de validation lui-même est
-- un chantier séparé, hors périmètre ici). Défaut 'validee' pour ne jamais transformer
-- rétroactivement une indisponibilité ou un congé déjà existant en "en attente" : seul le nouveau
-- flux "Demandes" insère explicitement 'en_attente'.
alter table public.conges
  add column if not exists statut text not null default 'validee'
  check (statut in ('en_attente', 'validee', 'refusee'));

-- Traçabilité de la décision (utilisée par la future UI manager/admin, pas par cette tâche).
alter table public.conges add column if not exists traite_par uuid references public.profiles(id);
alter table public.conges add column if not exists traite_le timestamptz;

create index if not exists conges_statut_idx on public.conges (statut);

-- Un employé ne doit jamais pouvoir s'auto-valider une demande de congé (statut/traite_par/
-- traite_le), même via un appel direct à l'API REST — même principe que la protection des champs
-- sensibles côté RH (migration 0034/0038). Un admin ou un manager avec le droit "calendrier"/
-- "équipe" sur cette personne reste autorisé (nécessaire pour la future UI d'approbation).
create or replace function public.proteger_statut_conges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_admin()
    or public.a_droit_sur_profil('calendrier', new.profile_id)
    or public.a_droit_sur_profil('equipe', new.profile_id)
  ) then
    new.statut := old.statut;
    new.traite_par := old.traite_par;
    new.traite_le := old.traite_le;
  end if;
  return new;
end;
$$;

drop trigger if exists before_conges_update_proteger_statut on public.conges;
create trigger before_conges_update_proteger_statut
  before update on public.conges
  for each row execute function public.proteger_statut_conges();

-- Une "indisponibilité" reste toujours auto-supprimable par son auteur (aucune notion
-- d'approbation) ; un "congé" ne l'est plus que tant qu'il est encore "en_attente" — une fois
-- validé/refusé, il devient un historique qu'on ne supprime plus soi-même. Remplace (et non
-- additionne) "conges_suppression" : une policy additionnelle ne peut qu'élargir un droit, jamais
-- le restreindre.
drop policy if exists "conges_suppression" on public.conges;
create policy "conges_suppression" on public.conges
  for delete using (
    (profile_id = auth.uid() and (type = 'indisponibilite' or statut = 'en_attente'))
    or public.is_admin()
    or public.a_droit_sur_profil('calendrier', profile_id)
  );
