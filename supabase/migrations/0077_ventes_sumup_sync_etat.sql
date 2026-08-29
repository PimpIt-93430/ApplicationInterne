-- Constat en corrigeant le cron (migration 0076) : `cron.job_run_details` marque un run
-- "succeeded" dès que la requête HTTP est envoyée via pg_net, pas quand la synchro aboutit
-- vraiment côté fonction (timeout, erreur SumUp, 401 dû à un secret Vault absent comme cf.
-- migration 0075...) — aucune trace fiable ne permettait de savoir si le cron avait réellement
-- fonctionné un matin donné. Cette table est mise à jour par sync-ventes-sumup à chaque
-- invocation (succès ou échec), pour donner un signal de fraîcheur observable dans le Hub plutôt
-- qu'une simple affirmation.
create table public.ventes_sumup_sync_etat (
  id boolean primary key default true,
  derniere_execution_le timestamptz not null default now(),
  ok boolean not null,
  message text,
  declenche_par text not null,
  constraint ventes_sumup_sync_etat_singleton check (id)
);

insert into public.ventes_sumup_sync_etat (id, ok, message, declenche_par)
values (true, false, 'Pas encore exécuté depuis la mise en place du suivi', 'init');

alter table public.ventes_sumup_sync_etat enable row level security;

-- Admin-only en lecture, alignée sur ventes_sumup — seule la fonction (service role, qui
-- contourne RLS) écrit dedans.
create policy "ventes_sumup_sync_etat_select_admin" on public.ventes_sumup_sync_etat
  for select using (public.is_admin());
