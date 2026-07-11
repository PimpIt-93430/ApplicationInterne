import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import {
  ajouterAffectationPopUp,
  fetchActiveProfiles,
  fetchAffectationsPopUp,
  retirerAffectationPopUp,
} from '@/api/profiles';

export function useActiveProfiles() {
  return useQuery({ queryKey: ['profiles-actifs'], queryFn: fetchActiveProfiles });
}

export function useAffectationsPopUp() {
  return useQuery({ queryKey: ['affectations-pop-ups'], queryFn: fetchAffectationsPopUp });
}

export function useAjouterAffectationPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { profileId: string; popUpId: string }) =>
      ajouterAffectationPopUp(params.profileId, params.popUpId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affectations-pop-ups'] }),
    onError: (error: Error) => Alert.alert('Échec de l\'attribution', error.message),
  });
}

export function useRetirerAffectationPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { profileId: string; popUpId: string }) =>
      retirerAffectationPopUp(params.profileId, params.popUpId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['affectations-pop-ups'] }),
    onError: (error: Error) => Alert.alert('Échec du retrait', error.message),
  });
}
