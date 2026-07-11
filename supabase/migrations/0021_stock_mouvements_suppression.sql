-- stock_mouvements n'avait jamais eu de policy DELETE (conçu à l'origine comme historique
-- append-only, cf. commentaire dans la migration 0008) : la suppression d'un comptage depuis le
-- Rapport (supprimerComptageBoiteJour) s'exécutait donc sans erreur mais ne supprimait 0 ligne,
-- RLS filtrant tout par défaut faute de policy correspondante. Même règle que l'insertion
-- (mouvements_insertion, cf. 0015) : admin, ou profil attribué au pop-up concerné.
drop policy if exists "mouvements_suppression" on public.stock_mouvements;
create policy "mouvements_suppression" on public.stock_mouvements
  for delete using (
    public.is_admin()
    or (
      pop_up_id is not null
      and exists (
        select 1 from public.profil_pop_ups
        where profile_id = auth.uid() and pop_up_id = stock_mouvements.pop_up_id
      )
    )
  );
