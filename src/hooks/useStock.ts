import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ajusterStockGeneral,
  attribuerPinsACase,
  creerPin,
  estimerPourcentagePinDansCase,
  fetchGrillePopUp,
  fetchMouvements,
  fetchPins,
  modifierPin,
  peserPinDansCase,
  retirerPinDeCase,
} from '@/api/stock';
import type { StockPin } from '@/types/database.types';

export function usePins() {
  return useQuery({ queryKey: ['stock-pins'], queryFn: fetchPins });
}

export function useGrillePopUp(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['stock-grille', popUpId],
    queryFn: () => fetchGrillePopUp(popUpId as string),
    enabled: !!popUpId,
  });
}

export function useMouvements(params: { pinId?: string; popUpId?: string }) {
  return useQuery({
    queryKey: ['stock-mouvements', params.pinId, params.popUpId],
    queryFn: () => fetchMouvements(params),
    enabled: !!(params.pinId || params.popUpId),
  });
}

export function useGererCasesPopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stock-grille', popUpId] });

  const attribuer = useMutation({
    mutationFn: (params: {
      casePosition: string;
      pinIdsActuels: string[];
      pinIdsVoulus: string[];
      profileId: string;
    }) => attribuerPinsACase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidate,
  });

  const retirer = useMutation({
    mutationFn: (params: { casePosition: string; pinId: string }) =>
      retirerPinDeCase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidate,
  });

  const peser = useMutation({
    mutationFn: (params: {
      boiteId: string;
      pinId: string;
      casePosition: string;
      poidsUnitaire: number;
      poidsPese: number;
      profileId: string;
    }) => peserPinDansCase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidate,
  });

  const estimer = useMutation({
    mutationFn: (params: {
      boiteId: string;
      pinId: string;
      casePosition: string;
      pourcentage: number;
      profileId: string;
    }) => estimerPourcentagePinDansCase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidate,
  });

  return { attribuer, retirer, peser, estimer };
}

export function useGererCatalogue() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['stock-pins'] });

  const creer = useMutation({
    mutationFn: (params: Parameters<typeof creerPin>[0]) => creerPin(params),
    onSuccess: invalidate,
  });

  const modifier = useMutation({
    mutationFn: ({ id, params }: { id: string; params: Partial<StockPin> }) => modifierPin(id, params),
    onSuccess: invalidate,
  });

  const ajusterStock = useMutation({
    mutationFn: (params: { pinId: string; delta: number; note: string; profileId: string }) =>
      ajusterStockGeneral(params),
    onSuccess: invalidate,
  });

  return { creer, modifier, ajusterStock };
}
