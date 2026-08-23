-- Retire le comportement "chaque admin est attribué au local 10h-19h par défaut" introduit en
-- 0016 : décision produit, un admin promu ou nouvellement créé ne doit plus recevoir d'horaire
-- récurrent automatique — il part de zéro, à régler à la main dans Équipe comme n'importe qui.

drop trigger if exists seed_horaire_admin_local_trigger on public.profiles;
drop function if exists public.seed_horaire_admin_local();

-- Nettoyage des lignes déjà seedées par ce mécanisme pour les admins actuels : on ne peut pas
-- distinguer une ligne seedée d'une ligne identique saisie à la main, donc on supprime toute
-- ligne d'admin qui correspond exactement à la signature du seed (local, lun-sam, 'toutes les
-- semaines', sans pause) — décision explicite acceptée : un admin qui aurait personnalisé
-- exactement ces mêmes horaires les reperdra aussi. Deux signatures d'heures possibles : 10h-19h
-- (le seed du trigger 0016) et 9h-19h (le fallback de genererPlanning.ts, cf. commit qui retire
-- HORAIRE_ADMIN_PAR_DEFAUT — au moins un admin en base avait ces horaires-là, saisis à la main
-- pour correspondre à ce fallback).
delete from public.horaires_recurrents_profil hrp
using public.profiles p, public.pop_ups l
where hrp.profile_id = p.id
  and p.role = 'admin'
  and hrp.pop_up_id = l.id
  and l.est_local
  and hrp.jour_semaine between 0 and 5
  and (hrp.heure_debut, hrp.heure_fin) in (('10:00:00', '19:00:00'), ('09:00:00', '19:00:00'))
  and hrp.semaine_reference = 'toutes'
  and hrp.pause_debut is null
  and hrp.pause_fin is null;
