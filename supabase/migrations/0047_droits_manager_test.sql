-- Compte de test "manager" (Pierre Pietruzzella, type_contrat déjà 'manager') utilisé par la
-- prévisualisation admin (cf. useVueAdminStore/useProfilEffectif, même mécanisme que Namory pour
-- l'alternant) : sans droits, il serait indiscernable d'un simple employé — on lui accorde les
-- deux droits qui définissent fonctionnellement un manager de pop-up (tous lieux, pop_up_id null).
insert into public.droits_employe (id, profile_id, fonctionnalite, pop_up_id)
select gen_random_uuid(), 'c49e9c24-c9b9-43b7-8f0d-d0c83d0a2d8c', f, null
from unnest(array['equipe', 'calendrier']) as f
where not exists (
  select 1 from public.droits_employe de
  where de.profile_id = 'c49e9c24-c9b9-43b7-8f0d-d0c83d0a2d8c' and de.fonctionnalite = f
);
