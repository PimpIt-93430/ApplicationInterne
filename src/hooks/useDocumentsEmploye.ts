import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

import {
  fetchDocumentsEmploye,
  supprimerDocumentEmploye,
  uploaderDocumentEmploye,
} from '@/api/documentsEmploye';
import type { DocumentEmploye } from '@/types/database.types';

export function useDocumentsEmploye(profileId: string | undefined) {
  return useQuery({
    queryKey: ['documents-employe', profileId],
    queryFn: () => fetchDocumentsEmploye(profileId as string),
    enabled: !!profileId,
  });
}

export function useUploaderDocumentEmploye(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploaderDocumentEmploye,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents-employe', profileId] }),
    onError: (error: Error) => Alert.alert('Échec de l\'envoi', error.message),
  });
}

export function useSupprimerDocumentEmploye(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (document: DocumentEmploye) => supprimerDocumentEmploye(document.id, document.chemin_stockage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents-employe', profileId] }),
    onError: (error: Error) => Alert.alert('Échec de la suppression', error.message),
  });
}
