import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  ajusterStockGeneral,
  attribuerPinsACase,
  creerPin,
  estimerPourcentagePinDansCase,
  fetchGrillePopUp,
  fetchMouvements,
  fetchMouvementsComptage,
  fetchPins,
  modifierPin,
  peserPinDansCase,
  retirerPinDeCase,
  supprimerComptageBoiteJour,
  supprimerComptagePinDansCase,
  validerReapprovisionnement,
} from '@/api/stock';
import { supabase } from '@/api/supabaseClient';
import type { StockPin } from '@/types/database.types';

export function usePins() {
  return useQuery({ queryKey: ['stock-pins'], queryFn: fetchPins });
}

// Un alternant compte une boîte sur son pop-up depuis son propre appareil : sans abonnement temps
// réel, l'admin qui a déjà l'écran Stock ouvert sur ce pop-up ne voit rien passer tant qu'il ne
// rouvre pas l'écran (react-query ne sait pas qu'une donnée a changé ailleurs).
export function useGrillePopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-grille', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`stock-grille-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pop_up_pin_boites', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
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

export function useMouvementsComptage(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-mouvements-comptage', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`stock-mouvements-comptage-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_mouvements', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchMouvementsComptage(popUpId as string),
    enabled: !!popUpId,
  });
}

export function useGererCasesPopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-grille', popUpId] });
    queryClient.invalidateQueries({ queryKey: ['stock-mouvements-comptage', popUpId] });
  };

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

  const supprimerComptage = useMutation({
    mutationFn: (params: { boiteId: string; pinId: string }) => supprimerComptagePinDansCase(params),
    onSuccess: invalidate,
  });

  const supprimerComptageJour = useMutation({
    mutationFn: (params: { casePosition: string; jourISO: string }) =>
      supprimerComptageBoiteJour({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidate,
  });

  const validerReappro = useMutation({
    mutationFn: () => validerReapprovisionnement(popUpId as string),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['stock-pins'] });
    },
  });

  return { attribuer, retirer, peser, estimer, supprimerComptage, supprimerComptageJour, validerReappro };
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
