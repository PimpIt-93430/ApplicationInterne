import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { fetchGuides, obtenirUrlGuide, supprimerGuide, uploaderGuide } from '@/api/guides';

export function useGuides() {
  return useQuery({ queryKey: ['guides'], queryFn: fetchGuides });
}

export function useUploaderGuide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploaderGuide,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guides'] }),
    onError: (error: Error) => Alert.alert("Échec de l'envoi", error.message),
  });
}

export function useSupprimerGuide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; cheminStockage: string }) => supprimerGuide(params.id, params.cheminStockage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['guides'] }),
    onError: (error: Error) => Alert.alert('Échec de la suppression', error.message),
  });
}

export function useOuvrirGuide() {
  return useMutation({
    mutationFn: obtenirUrlGuide,
    onError: (error: Error) => Alert.alert("Impossible d'ouvrir le document", error.message),
  });
}
