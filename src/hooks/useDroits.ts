import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ajouterDroit, fetchDroitsEmploye, supprimerDroit } from '@/api/droits';
import type { Fonctionnalite } from '@/types/database.types';

export function useDroitsEmploye(profileId: string | undefined) {
  return useQuery({
    queryKey: ['droits-employe', profileId],
    queryFn: () => fetchDroitsEmploye(profileId as string),
    enabled: !!profileId,
  });
}

/** Version légère utilisée par la navigation (MenuLateral/EnteteMenu) — même donnée que
 * `useDroitsEmploye`, nom plus parlant pour "mes propres droits" côté appelant connecté. */
export const useMesDroits = useDroitsEmploye;

export function useAjouterDroit(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { fonctionnalite: Fonctionnalite; popUpId: string | null }) =>
      ajouterDroit({ profileId: profileId as string, ...params }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['droits-employe', profileId] }),
  });
}

export function useSupprimerDroit(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: supprimerDroit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['droits-employe', profileId] }),
  });
}
