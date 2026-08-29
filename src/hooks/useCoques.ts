import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  definirMappingSumupCoque,
  definirStockInitialCoque,
  enregistrerInventaireCoques,
  fetchCoquesInventaires,
  fetchCoquesStock,
  fetchMappingSumupCoques,
  fetchNomsProduitsSumupNonMappesCoques,
  supprimerMappingSumupCoque,
} from '@/api/coques';
import { supabase } from '@/api/supabaseClient';
import type { CoqueInventaire, CoqueMappingSumup } from '@/types/database.types';

export function useCoquesStock() {
  const queryClient = useQueryClient();
  const queryKey = ['coques-stock'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`coques-stock-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coques_stock' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchCoquesStock });
}

/** Inventaire propre à un pop-up (contrairement au stock visé, unique et partagé — cf.
 * useCoquesStock). Même principe que useChaussuresInventaires. */
export function useCoquesInventaires(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['coques-inventaires', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`coques-inventaires-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'coques_inventaires', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchCoquesInventaires(popUpId as string),
    enabled: !!popUpId,
  });
}

/** Table de correspondance nom produit SumUp → modèle/variante/couleur (écran admin "Stock cible"). */
export function useMappingSumupCoques() {
  return useQuery({ queryKey: ['coques-mapping-sumup'], queryFn: fetchMappingSumupCoques });
}

export function useNomsProduitsSumupNonMappesCoques() {
  return useQuery({
    queryKey: ['coques-mapping-sumup-non-mappes'],
    queryFn: fetchNomsProduitsSumupNonMappesCoques,
  });
}

export function useGererMappingSumupCoques() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['coques-mapping-sumup'] });
    queryClient.invalidateQueries({ queryKey: ['coques-mapping-sumup-non-mappes'] });
  };

  const definirMapping = useMutation({
    mutationFn: (params: {
      nomProduit: string;
      modele: CoqueMappingSumup['modele'];
      variante: CoqueMappingSumup['variante'];
      couleur: CoqueMappingSumup['couleur'];
    }) => definirMappingSumupCoque(params.nomProduit, params.modele, params.variante, params.couleur),
    onSuccess: invalidate,
  });

  const supprimerMapping = useMutation({
    mutationFn: (id: string) => supprimerMappingSumupCoque(id),
    onSuccess: invalidate,
  });

  return { definirMapping, supprimerMapping };
}

export function useGererCoques(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateStock = () => queryClient.invalidateQueries({ queryKey: ['coques-stock'] });
  const invalidateInventaires = () => queryClient.invalidateQueries({ queryKey: ['coques-inventaires', popUpId] });

  const definirStock = useMutation({
    mutationFn: (params: { id: string; quantite: number }) => definirStockInitialCoque(params.id, params.quantite),
    onSuccess: invalidateStock,
  });

  const validerInventaire = useMutation({
    mutationFn: (params: {
      lignes: {
        modele: CoqueInventaire['modele'];
        variante: CoqueInventaire['variante'];
        couleur: CoqueInventaire['couleur'];
        quantite_comptee: number;
      }[];
      profileId: string;
    }) => enregistrerInventaireCoques(params.lignes, params.profileId, popUpId as string),
    onSuccess: invalidateInventaires,
  });

  return { definirStock, validerInventaire };
}
