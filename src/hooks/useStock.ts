import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  ajusterStockGeneral,
  attribuerPinsACase,
  basculerCommandePin,
  creerPin,
  fetchAttributionsPins,
  fetchDerniersRemplissages,
  fetchGrillePopUp,
  fetchHistoriqueCommandes,
  fetchMouvements,
  fetchPins,
  fetchRemplissages,
  modifierPin,
  peserStockGeneral,
  retirerPinDeCase,
  signalerPinInconnu,
  supprimerRemplissage as supprimerRemplissageApi,
  validerCommandesRecuesEtHistoriser,
  validerRemplissageBoite,
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

// Dernier remplissage connu par case (affiché sous "Valider le remplissage" dans l'écran de case).
export function useDerniersRemplissages(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-remplissages', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`stock-remplissages-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pop_up_boite_remplissages', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchDerniersRemplissages(popUpId as string),
    enabled: !!popUpId,
  });
}

// Historique complet (pas juste le dernier par case) pour l'onglet Rapport, groupé par jour côté UI.
export function useRemplissages(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['stock-remplissages-historique', popUpId],
    queryFn: () => fetchRemplissages(popUpId as string),
    enabled: !!popUpId,
  });
}

// Historique des commandes validées (qui a été trouvé ou pas) — sert aussi de base au cron
// hebdomadaire qui ajuste seuil_cible côté base (migration 0029).
export function useHistoriqueCommandes(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['stock-historique-commandes', popUpId],
    queryFn: () => fetchHistoriqueCommandes(popUpId as string),
    enabled: !!popUpId,
  });
}

// Vue d'ensemble (catalogue) : quelles cases contiennent déjà chaque pin, tous pop-ups confondus.
// Sans filtre de pop-up, donc abonnement realtime global sur la table plutôt que par lieu.
export function useAttributionsPins() {
  const queryClient = useQueryClient();
  const queryKey = ['stock-attributions-pins'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`stock-attributions-pins-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pop_up_pin_boites' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchAttributionsPins });
}

export function useGererCasesPopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateGrille = () => queryClient.invalidateQueries({ queryKey: ['stock-grille', popUpId] });

  const attribuer = useMutation({
    mutationFn: (params: {
      casePosition: string;
      pinIdsActuels: string[];
      pinIdsVoulus: string[];
      profileId: string;
    }) => attribuerPinsACase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidateGrille,
  });

  const retirer = useMutation({
    mutationFn: (params: { casePosition: string; pinId: string }) =>
      retirerPinDeCase({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidateGrille,
  });

  const basculerCommande = useMutation({
    mutationFn: (params: { boiteId: string; aCommander: boolean; profileId: string }) =>
      basculerCommandePin(params),
    onSuccess: invalidateGrille,
  });

  const validerRemplissage = useMutation({
    mutationFn: (params: { casePosition: string; profileId: string }) =>
      validerRemplissageBoite({ popUpId: popUpId as string, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages', popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages-historique', popUpId] });
    },
  });

  const validerCommandes = useMutation({
    mutationFn: (params: { profileId: string; resultats: { pinId: string; trouve: boolean }[] }) =>
      validerCommandesRecuesEtHistoriser({ popUpId: popUpId as string, ...params }),
    onSuccess: () => {
      invalidateGrille();
      queryClient.invalidateQueries({ queryKey: ['stock-historique-commandes', popUpId] });
    },
  });

  const supprimerRemplissage = useMutation({
    mutationFn: (id: string) => supprimerRemplissageApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages', popUpId] });
      queryClient.invalidateQueries({ queryKey: ['stock-remplissages-historique', popUpId] });
    },
  });

  return {
    attribuer,
    retirer,
    basculerCommande,
    validerRemplissage,
    validerCommandes,
    supprimerRemplissage,
  };
}

export function useGererCatalogue() {
  const queryClient = useQueryClient();
  // Le catalogue (stock-pins) n'est pas la seule vue à contenir les pins : la grille des boîtes
  // (stock-grille) embarque le pin complet dans chaque case (contenu.pin) — sans cette
  // invalidation, éditer le poids/seuil/taille depuis le catalogue laisse l'écran de pesée avec
  // les anciennes valeurs tant que la grille n'est pas rechargée par un autre moyen.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-pins'] });
    queryClient.invalidateQueries({ queryKey: ['stock-grille'] });
  };

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

  const peser = useMutation({
    mutationFn: (params: { pinId: string; popUpLocalId: string; poidsPese: number; profileId: string }) =>
      peserStockGeneral(params),
    onSuccess: invalidate,
  });

  const signaler = useMutation({
    mutationFn: (params: { photoUrl: string; note?: string }) => signalerPinInconnu(params),
    onSuccess: invalidate,
  });

  return { creer, modifier, ajusterStock, peser, signaler };
}
