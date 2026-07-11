import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchHorairesRecurrents,
  fetchTousHorairesRecurrents,
  upsertHoraireRecurrent,
} from '@/api/horairesRecurrents';

export function useHorairesRecurrents(profileId: string | undefined) {
  return useQuery({
    queryKey: ['horaires-recurrents', profileId],
    queryFn: () => fetchHorairesRecurrents(profileId as string),
    enabled: !!profileId,
  });
}

export function useTousHorairesRecurrents() {
  return useQuery({ queryKey: ['horaires-recurrents-tous'], queryFn: fetchTousHorairesRecurrents });
}

export function useEnregistrerHoraireRecurrent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertHoraireRecurrent,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['horaires-recurrents'] }).then(() =>
        queryClient.invalidateQueries({ queryKey: ['horaires-recurrents-tous'] }),
      ),
  });
}
