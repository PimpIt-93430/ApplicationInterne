import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';

import {
  ajouterPointageManuel,
  fetchAPointeAujourdhui,
  fetchPointagesJour,
  obtenirUrlPhotoPointage,
  pointer,
  supprimerPointage,
} from '@/api/pointages';
import type { TypePointage } from '@/types/database.types';

export function usePointagesJour(popUpId: string | undefined, debut: Date, fin: Date) {
  return useQuery({
    queryKey: ['pointages', popUpId, debut.toISOString()],
    queryFn: () => fetchPointagesJour(popUpId as string, debut, fin),
    enabled: !!popUpId,
  });
}

export function useAPointeAujourdhui(profileId: string | undefined, enabled = true) {
  const debutJour = startOfDay(new Date());
  return useQuery({
    queryKey: ['pointages', 'moi', profileId, debutJour.toISOString()],
    queryFn: () => fetchAPointeAujourdhui(profileId as string, debutJour),
    enabled: !!profileId && enabled,
  });
}

/** URL signée valable 5 min : on la garde 4 min en cache pour ne jamais afficher une URL expirée. */
export function useUrlPhotoPointage(chemin: string | null | undefined) {
  return useQuery({
    queryKey: ['pointage-photo', chemin],
    queryFn: () => obtenirUrlPhotoPointage(chemin as string),
    enabled: !!chemin,
    staleTime: 4 * 60 * 1000,
  });
}

export function usePointer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pointer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pointages'] }),
  });
}

export function useGererPointages() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pointages'] });
  const ajouter = useMutation({
    mutationFn: (params: {
      profileId: string;
      popUpId: string;
      type: TypePointage;
      horodatage: Date;
      saisiPar: string;
    }) => ajouterPointageManuel(params),
    onSuccess: invalidate,
  });
  const supprimer = useMutation({ mutationFn: supprimerPointage, onSuccess: invalidate });
  return { ajouter, supprimer };
}
