import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteEffectifCreneau,
  fetchEffectifsCreneaux,
  fetchHorairesOuverture,
  fetchReglesGlobales,
  fetchToutesEffectifsCreneaux,
  fetchToutesHorairesOuverture,
  updateReglesGlobales,
  upsertEffectifCreneau,
  upsertHoraireOuverture,
} from '@/api/reglesMetier';

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

export function useEffectifsCreneaux(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['regles-effectifs-creneau', popUpId],
    queryFn: () => fetchEffectifsCreneaux(popUpId as string),
    enabled: !!popUpId,
  });
}

export function useToutesEffectifsCreneaux() {
  return useQuery({ queryKey: ['regles-effectifs-creneau-toutes'], queryFn: fetchToutesEffectifsCreneaux });
}

export function useReglesGlobales() {
  return useQuery({ queryKey: ['regles-globales'], queryFn: fetchReglesGlobales });
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

export function useEnregistrerEffectifCreneau() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertEffectifCreneau,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['regles-effectifs-creneau'] }).then(() =>
        queryClient.invalidateQueries({ queryKey: ['regles-effectifs-creneau-toutes'] }),
      ),
  });
}

export function useSupprimerEffectifCreneau() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEffectifCreneau,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['regles-effectifs-creneau'] }).then(() =>
        queryClient.invalidateQueries({ queryKey: ['regles-effectifs-creneau-toutes'] }),
      ),
  });
}

export function useEnregistrerReglesGlobales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateReglesGlobales,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['regles-globales'] }),
  });
}
