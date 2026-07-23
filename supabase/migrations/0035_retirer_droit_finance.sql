-- Finance reste strictement réservé aux admins, en permanence (décision explicite) : on retire la
-- possibilité d'accorder un droit "finance" à qui que ce soit d'autre — pas juste masqué côté UI,
-- vraiment retiré (contrainte + policy), pour ne pas laisser une porte entrouverte inutilisée.
delete from public.droits_employe where fonctionnalite = 'finance';

drop policy if exists "ventes_sumup_lecture_manager" on public.ventes_sumup;

alter table public.droits_employe drop constraint droits_employe_fonctionnalite_check;
alter table public.droits_employe add constraint droits_employe_fonctionnalite_check check (fonctionnalite in ('calendrier'));
