-- Audit latences hub (2026-09-05) : l'écran Stock (calcul "à ramener" chaussures/coques/sacs)
-- charge toutes les lignes ventes_sumup_lignes d'un pop-up (fetchVentesSumupLignes), paginé par
-- PostgREST. Sur le plus gros pop-up (~90 000 lignes), chaque page faisait ~4s en moyenne (jusqu'à
-- 7,9s), 1334 appels cumulés = ~1h30 de temps DB total. Cause : l'index existant
-- (pop_up_id, nom_produit, horodatage desc) ne peut pas servir l'ORDER BY horodatage (nom_produit
-- s'intercale), donc Postgres fait un Parallel Seq Scan + tri sur toute la table (140k lignes)
-- à chaque page. EXPLAIN ANALYZE avec un index (pop_up_id, horodatage desc) : 658ms -> 0.1ms.
create index if not exists ventes_sumup_lignes_popup_horodatage_idx
  on public.ventes_sumup_lignes (pop_up_id, horodatage desc);

-- Même audit : la policy de lecture appelait auth.uid() nu, ré-évalué par Postgres à chaque ligne
-- scannée au lieu d'une seule fois par requête (warning "auth_rls_initplan" de l'advisor Supabase).
-- Sur un scan de 90k lignes ça s'ajoute au coût ci-dessus. Fix recommandé par Supabase :
-- envelopper dans (select ...). Aucun changement de comportement, seulement du plan d'exécution.
drop policy if exists "ventes_sumup_lignes_lecture" on public.ventes_sumup_lignes;
create policy "ventes_sumup_lignes_lecture" on public.ventes_sumup_lignes
  for select using (
    public.is_admin()
    or (
      pop_up_id is not null
      and exists (
        select 1 from public.profil_pop_ups
        where profile_id = (select auth.uid()) and pop_up_id = ventes_sumup_lignes.pop_up_id
      )
    )
  );
