import { usePopUps } from '@/hooks/usePopUps';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useResponsable } from '@/hooks/useResponsable';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import { construireMapAffectations, popUpsAttribues, popUpsVentes } from '@/utils/affectations';

/** Qui a l'onglet "Ventes" dans la barre du bas, et est-ce que c'est le premier écran ouvert.
 * - admins, responsables de pop-up (cf. useResponsable), droit "voir les chiffres de tous les pop-ups" ;
 * - alternant attribué à un pop-up avec "Onglet Ventes pour les alternants" coché (migration 0123) ;
 * - toute personne (hors admin) attribuée à un pop-up avec le pointage activé : le bouton "Pointer"
 *   est dans Ventes, premier onglet ouvert (retour utilisateur du 2026-11-03).
 * `pret` = false tant que les pop-ups/affectations ne sont pas chargés. */
export function useOngletVentes(): { aOngletVentes: boolean; pret: boolean } {
  const profile = useProfilEffectif();
  const { data: popUps } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const responsable = useResponsable();

  if (!profile || !responsable.pret) return { aOngletVentes: false, pret: false };
  if (profile.role === 'admin' || responsable.estResponsable || profile.voir_chiffres_tous_popups) {
    return { aOngletVentes: true, pret: true };
  }
  if (!popUps || !affectations) return { aOngletVentes: false, pret: false };

  const map = construireMapAffectations(affectations);
  const aOngletVentes =
    (profile.type_contrat === 'alternant' && popUpsVentes(profile, map, popUps).length > 0) ||
    popUpsAttribues(profile, map, popUps).some((p) => p.pointage_actif);
  return { aOngletVentes, pret: true };
}
