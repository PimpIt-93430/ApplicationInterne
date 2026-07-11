import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchHorairesOuverture, fetchToutesHorairesOuverture, upsertHoraireOuverture } from '@/api/reglesMetier';

export function useHorairesOuverture(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['regles-horaires-ouverture', popUpId],
    queryFn: () => fetchHorairesOuverture(popUpId as string),
    enabled: !!popUpId,
  });
}

export function useToutesHorairesOuverture() {
  return useQuery({ queryKey: ['regles-horaires-ouverture-toutes'], queryFn: fetchToutesHorairesOuverture });
}

export function useEnregistrerHoraireOuverture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertHoraireOuverture,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['regles-horaires-ouverture'] }).then(() =>
        queryClient.invalidateQueries({ queryKey: ['regles-horaires-ouverture-toutes'] }),
      ),
  });
}
