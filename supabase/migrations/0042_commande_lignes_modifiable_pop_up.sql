-- Bug existant : seuls un admin ou un membre du local pouvaient écrire dans commande_lignes — un
-- employé normal (ni admin, ni rattaché au pop-up "local") qui envoie une commande pour SON
-- pop-up échouait silencieusement à l'insertion des lignes (jamais remarqué jusqu'ici : tous les
-- tests avaient été faits par un admin ou par un admin en préview "alternant", qui passe la
-- vérification RLS avec son propre compte réel).
--
-- Ajoute : le pop-up attribué à la commande peut lui-même ajouter/retirer des pins de SA commande
-- tant qu'elle est encore au statut "envoyee" (pas encore prise en main formellement par le local
-- via validerCommandePrete, qui passe le statut à "prete") — couvre à la fois l'envoi initial et la
-- modification ultérieure demandée. Une fois "prete", plus aucune écriture pop-up n'est permise :
-- le local a déjà commencé à peser/préparer. Cocher/décocher "fait" (UPDATE) reste exclusivement
-- réservé à l'admin/au local via la policy "commande_lignes_ecriture" existante, non touchée.
create policy "commande_lignes_ajout_popup" on public.commande_lignes
  for insert with check (
    exists (
      select 1 from public.commandes_pop_up cpu
      join public.profil_pop_ups ppu on ppu.pop_up_id = cpu.pop_up_id
      where cpu.id = commande_lignes.commande_id
        and ppu.profile_id = auth.uid()
        and cpu.statut = 'envoyee'
    )
  );

create policy "commande_lignes_suppression_popup" on public.commande_lignes
  for delete using (
    exists (
      select 1 from public.commandes_pop_up cpu
      join public.profil_pop_ups ppu on ppu.pop_up_id = cpu.pop_up_id
      where cpu.id = commande_lignes.commande_id
        and ppu.profile_id = auth.uid()
        and cpu.statut = 'envoyee'
    )
  );
