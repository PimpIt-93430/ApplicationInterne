import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { creerPopUp, definirLocal, fetchPopUps, renommerPopUp, supprimerPopUp } from '@/api/popUps';

export function usePopUps() {
  return useQuery({ queryKey: ['pop-ups'], queryFn: fetchPopUps });
}

export function useCreerPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creerPopUp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pop-ups'] });
      queryClient.invalidateQueries({ queryKey: ['regles-horaires-ouverture'] });
    },
  });
}

export function useRenommerPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; nom: string }) => renommerPopUp(params.id, params.nom),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
  });
}

export function useDefinirLocal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; estLocal: boolean }) => definirLocal(params.id, params.estLocal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
    onError: (error: Error) => Alert.alert('Échec de l\'enregistrement', error.message),
  });
}

export function useSupprimerPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: supprimerPopUp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
  });
}
