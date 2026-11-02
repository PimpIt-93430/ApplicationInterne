import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';

import {
  ajouterPointageManuel,
  fetchAPointeAujourdhui,
  definirPositionPopUp,
  fetchPointagesJour,
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

export function usePointer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { code: string; lat: number | null; lon: number | null; positionSimulee: boolean }) =>
      pointer(params.code, params.lat, params.lon, params.positionSimulee),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pointages'] }),
  });
}

export function useDefinirPositionPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { popUpId: string; lat: number; lon: number }) =>
      definirPositionPopUp(params.popUpId, params.lat, params.lon),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
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
