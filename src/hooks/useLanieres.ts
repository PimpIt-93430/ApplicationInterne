import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  definirMappingSumupLaniere,
  definirStockInitialLaniere,
  enregistrerInventaireLanieres,
  fetchLanieresInventaires,
  fetchLanieresStock,
  fetchMappingSumupLanieres,
  fetchNomsProduitsSumupNonMappesLanieres,
  supprimerMappingSumupLaniere,
} from '@/api/lanieres';
import { supabase } from '@/api/supabaseClient';
import type { LaniereInventaire, LaniereMappingSumup } from '@/types/database.types';

export function useLanieresStock() {
  const queryClient = useQueryClient();
  const queryKey = ['lanieres-stock'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`lanieres-stock-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lanieres_stock' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchLanieresStock });
}

/** Inventaire propre à un pop-up (contrairement au stock visé, unique et partagé — cf.
 * useLanieresStock) : chaque lieu ne voit que son propre historique de comptages. */
export function useLanieresInventaires(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['lanieres-inventaires', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`lanieres-inventaires-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lanieres_inventaires', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchLanieresInventaires(popUpId as string),
    enabled: !!popUpId,
  });
}

/** Table de correspondance nom produit SumUp → couleur/taille (écran admin "Stock cible"). */
export function useMappingSumupLanieres() {
  return useQuery({ queryKey: ['lanieres-mapping-sumup'], queryFn: fetchMappingSumupLanieres });
}

export function useNomsProduitsSumupNonMappesLanieres() {
  return useQuery({ queryKey: ['lanieres-mapping-sumup-non-mappes'], queryFn: fetchNomsProduitsSumupNonMappesLanieres });
}

export function useGererMappingSumupLanieres() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lanieres-mapping-sumup'] });
    queryClient.invalidateQueries({ queryKey: ['lanieres-mapping-sumup-non-mappes'] });
  };

  const definirMapping = useMutation({
    mutationFn: (params: { nomProduit: string; couleur: LaniereMappingSumup['couleur']; taille: LaniereMappingSumup['taille'] }) =>
      definirMappingSumupLaniere(params.nomProduit, params.couleur, params.taille),
    onSuccess: invalidate,
  });

  const supprimerMapping = useMutation({
    mutationFn: (id: string) => supprimerMappingSumupLaniere(id),
    onSuccess: invalidate,
  });

  return { definirMapping, supprimerMapping };
}

export function useGererLanieres(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateStock = () => queryClient.invalidateQueries({ queryKey: ['lanieres-stock'] });
  const invalidateInventaires = () => queryClient.invalidateQueries({ queryKey: ['lanieres-inventaires', popUpId] });

  const definirStock = useMutation({
    mutationFn: (params: { id: string; quantite: number }) => definirStockInitialLaniere(params.id, params.quantite),
    onSuccess: invalidateStock,
  });

  const validerInventaire = useMutation({
    mutationFn: (params: {
      lignes: { couleur: LaniereInventaire['couleur']; taille: LaniereInventaire['taille']; quantite_comptee: number }[];
      profileId: string;
    }) => enregistrerInventaireLanieres(params.lignes, params.profileId, popUpId as string),
    onSuccess: invalidateInventaires,
  });

  return { definirStock, validerInventaire };
}
