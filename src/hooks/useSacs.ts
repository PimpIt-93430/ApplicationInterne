import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  definirMappingSumupSac,
  definirStockInitialSac,
  enregistrerInventaireSacs,
  fetchMappingSumupSacs,
  fetchNomsProduitsSumupNonMappesSacs,
  fetchSacsInventaires,
  fetchSacsStock,
  supprimerMappingSumupSac,
} from '@/api/sacs';
import { supabase } from '@/api/supabaseClient';
import type { SacInventaire, SacMappingSumup } from '@/types/database.types';

export function useSacsStock() {
  const queryClient = useQueryClient();
  const queryKey = ['sacs-stock'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`sacs-stock-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sacs_stock' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchSacsStock });
}

/** Inventaire propre à un pop-up (contrairement au stock visé, unique et partagé — cf.
 * useSacsStock). Même principe que useChaussuresInventaires. */
export function useSacsInventaires(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['sacs-inventaires', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`sacs-inventaires-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sacs_inventaires', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchSacsInventaires(popUpId as string),
    enabled: !!popUpId,
  });
}

/** Table de correspondance nom produit SumUp → produit/couleur (écran admin "Stock cible"). */
export function useMappingSumupSacs() {
  return useQuery({ queryKey: ['sacs-mapping-sumup'], queryFn: fetchMappingSumupSacs });
}

export function useNomsProduitsSumupNonMappesSacs() {
  return useQuery({ queryKey: ['sacs-mapping-sumup-non-mappes'], queryFn: fetchNomsProduitsSumupNonMappesSacs });
}

export function useGererMappingSumupSacs() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sacs-mapping-sumup'] });
    queryClient.invalidateQueries({ queryKey: ['sacs-mapping-sumup-non-mappes'] });
  };

  const definirMapping = useMutation({
    mutationFn: (params: { nomProduit: string; produit: SacMappingSumup['produit']; couleur: SacMappingSumup['couleur'] }) =>
      definirMappingSumupSac(params.nomProduit, params.produit, params.couleur),
    onSuccess: invalidate,
  });

  const supprimerMapping = useMutation({
    mutationFn: (id: string) => supprimerMappingSumupSac(id),
    onSuccess: invalidate,
  });

  return { definirMapping, supprimerMapping };
}

export function useGererSacs(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateStock = () => queryClient.invalidateQueries({ queryKey: ['sacs-stock'] });
  const invalidateInventaires = () => queryClient.invalidateQueries({ queryKey: ['sacs-inventaires', popUpId] });

  const definirStock = useMutation({
    mutationFn: (params: { id: string; quantite: number }) => definirStockInitialSac(params.id, params.quantite),
    onSuccess: invalidateStock,
  });

  const validerInventaire = useMutation({
    mutationFn: (params: {
      lignes: { produit: SacInventaire['produit']; couleur: SacInventaire['couleur']; quantite_comptee: number }[];
      profileId: string;
    }) => enregistrerInventaireSacs(params.lignes, params.profileId, popUpId as string),
    onSuccess: invalidateInventaires,
  });

  return { definirStock, validerInventaire };
}
