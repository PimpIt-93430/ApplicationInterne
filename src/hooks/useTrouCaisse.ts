import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  creerTrouCaisse,
  fetchPersonnelJour,
  fetchTrousCaisse,
  fetchTrousCaisseIgnores,
  ignorerTrouCaisse,
  supprimerTrouCaisse,
} from '@/api/trouCaisse';

export function useTrousCaisse() {
  return useQuery({ queryKey: ['trous-caisse'], queryFn: fetchTrousCaisse });
}

export function useTrousCaisseIgnores() {
  return useQuery({ queryKey: ['trous-caisse-ignores'], queryFn: fetchTrousCaisseIgnores });
}

export function usePersonnelJour(popUpId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['trou-caisse-personnel-jour', popUpId, date],
    queryFn: () => fetchPersonnelJour(popUpId as string, date as string),
    enabled: !!popUpId && !!date,
  });
}

export function useGererTrouCaisse() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['trous-caisse'] });

  const ajouter = useMutation({
    mutationFn: (params: Parameters<typeof creerTrouCaisse>[0]) => creerTrouCaisse(params),
    onSuccess: invalidate,
  });

  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerTrouCaisse(id),
    onSuccess: invalidate,
  });

  const ignorer = useMutation({
    mutationFn: (params: { popUpId: string; date: string; profileId: string }) =>
      ignorerTrouCaisse(params.popUpId, params.date, params.profileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trous-caisse-ignores'] }),
  });

  return { ajouter, supprimer, ignorer };
}
