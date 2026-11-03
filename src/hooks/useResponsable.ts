import { useMemo } from 'react';

import { useMesDroits } from '@/hooks/useDroits';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import type { Profile } from '@/types/database.types';

/** Droits simplifiés (retour utilisateur du 2026-11-03) — trois niveaux :
 * - admin : tout, partout ;
 * - responsable de pop-up : tout sur SON/SES pop-up(s), + voit les chiffres des autres pop-ups ;
 * - les autres (alternants…) : droits de base.
 * "Responsable de" = avoir un droit (calendrier/équipe) sur ce pop-up dans droits_employe, réglé
 * par l'admin dans Équipe > Droits. Ce n'est plus le type de contrat "manager" qui compte : un
 * manager affecté en renfort à d'autres pop-ups n'en est pas responsable. Même règle côté base
 * (est_manager_du_popup / est_manager_de_alternant, migration 0135). */
export function useResponsable(profilCible?: Profile | null) {
  const profilEffectif = useProfilEffectif();
  const profile = profilCible === undefined ? profilEffectif : profilCible;
  const { data: droits, isLoading } = useMesDroits(profile?.id);

  return useMemo(() => {
    const estAdmin = profile?.role === 'admin';
    const ids = new Set((droits ?? []).map((d) => d.pop_up_id).filter((id): id is string => !!id));
    const droitGlobal = (droits ?? []).some((d) => d.pop_up_id === null);
    const estResponsable = !estAdmin && (droits ?? []).length > 0;
    return {
      estAdmin,
      estResponsable,
      /** Admin ou responsable d'au moins un pop-up. */
      estAdminOuResponsable: estAdmin || estResponsable,
      /** Ce pop-up est-il sous sa responsabilité (toujours vrai pour un admin) ? */
      responsableDe: (popUpId: string | undefined | null) =>
        !!popUpId && (estAdmin || droitGlobal || ids.has(popUpId)),
      pret: !!profile && (estAdmin || !isLoading),
    };
  }, [profile, droits, isLoading]);
}
