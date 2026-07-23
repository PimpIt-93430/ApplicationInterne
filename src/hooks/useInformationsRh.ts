import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { fetchDatesDebutContratTous, fetchInformationsRh, upsertInformationsRh } from '@/api/informationsRh';

export function useInformationsRh(profileId: string | undefined) {
  return useQuery({
    queryKey: ['informations-rh', profileId],
    queryFn: () => fetchInformationsRh(profileId as string),
    enabled: !!profileId,
  });
}

export function useDatesDebutContratTous() {
  return useQuery({ queryKey: ['informations-rh-dates-debut-tous'], queryFn: fetchDatesDebutContratTous });
}

export function useEnregistrerInformationsRh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertInformationsRh,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['informations-rh', variables.profile_id] });
      queryClient.invalidateQueries({ queryKey: ['informations-rh-dates-debut-tous'] });
    },
    onError: (error: Error) => Alert.alert('Échec de l\'enregistrement', error.message),
  });
}
