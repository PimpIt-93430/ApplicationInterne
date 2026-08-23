import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  creerPopUp,
  fetchPopUps,
  modifierCoordonneesPopUp,
  modifierCreneauxPredefinisPopUp,
  modifierDatesPopUp,
  renommerPopUp,
  supprimerPopUp,
} from '@/api/popUps';

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

export function useModifierDatesPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; dateDebut: string | null; dateFin: string | null }) =>
      modifierDatesPopUp(params.id, params.dateDebut, params.dateFin),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
  });
}

export function useModifierCoordonneesPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; lat: number | null; lon: number | null }) =>
      modifierCoordonneesPopUp(params.id, params.lat, params.lon),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
  });
}

export function useModifierCreneauxPredefinisPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: string;
      matinDebut: string | null;
      matinFin: string | null;
      matinPauseDebut: string | null;
      matinPauseFin: string | null;
      apresMidiDebut: string | null;
      apresMidiFin: string | null;
      apresMidiPauseDebut: string | null;
      apresMidiPauseFin: string | null;
    }) => modifierCreneauxPredefinisPopUp(params.id, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
  });
}

export function useSupprimerPopUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: supprimerPopUp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pop-ups'] }),
  });
}
