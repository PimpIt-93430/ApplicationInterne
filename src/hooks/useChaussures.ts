import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  definirMappingSumup,
  definirStockInitial,
  enregistrerInventaire,
  fetchChaussuresInventaires,
  fetchChaussuresStock,
  fetchMappingSumupChaussures,
  fetchNomsProduitsSumupNonMappes,
  fetchVentesSumupLignes,
  supprimerMappingSumup,
} from '@/api/chaussures';
import { supabase } from '@/api/supabaseClient';
import type { ChaussureInventaire, ChaussureMappingSumup } from '@/types/database.types';

export function useChaussuresStock() {
  const queryClient = useQueryClient();
  const queryKey = ['chaussures-stock'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`chaussures-stock-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chaussures_stock' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchChaussuresStock });
}

/** Inventaire propre à un pop-up (contrairement au stock visé, unique et partagé — cf.
 * useChaussuresStock) : chaque lieu ne voit que son propre historique de comptages. */
export function useChaussuresInventaires(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['chaussures-inventaires', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`chaussures-inventaires-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chaussures_inventaires', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchChaussuresInventaires(popUpId as string),
    enabled: !!popUpId,
  });
}

/** Lignes de vente SumUp de ce pop-up, mises à jour en temps réel par la synchro (nouvelle vente,
 * ou réattribution qui déplace une vente vers/hors de ce lieu) — cf. useChaussuresInventaires pour
 * le même principe. */
export function useVentesSumupLignes(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['ventes-sumup-lignes', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`ventes-sumup-lignes-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ventes_sumup_lignes', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchVentesSumupLignes(popUpId as string),
    enabled: !!popUpId,
  });
}

/** Table de correspondance nom produit SumUp → couleur/taille (écran admin "Stock cible"). */
export function useMappingSumupChaussures() {
  return useQuery({ queryKey: ['chaussures-mapping-sumup'], queryFn: fetchMappingSumupChaussures });
}

export function useNomsProduitsSumupNonMappes() {
  return useQuery({ queryKey: ['chaussures-mapping-sumup-non-mappes'], queryFn: fetchNomsProduitsSumupNonMappes });
}

export function useGererMappingSumup() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['chaussures-mapping-sumup'] });
    queryClient.invalidateQueries({ queryKey: ['chaussures-mapping-sumup-non-mappes'] });
  };

  const definirMapping = useMutation({
    mutationFn: (params: { nomProduit: string; couleur: ChaussureMappingSumup['couleur']; taille: ChaussureMappingSumup['taille'] }) =>
      definirMappingSumup(params.nomProduit, params.couleur, params.taille),
    onSuccess: invalidate,
  });

  const supprimerMapping = useMutation({
    mutationFn: (id: string) => supprimerMappingSumup(id),
    onSuccess: invalidate,
  });

  return { definirMapping, supprimerMapping };
}

export function useGererChaussures(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateStock = () => queryClient.invalidateQueries({ queryKey: ['chaussures-stock'] });
  const invalidateInventaires = () =>
    queryClient.invalidateQueries({ queryKey: ['chaussures-inventaires', popUpId] });

  const definirStock = useMutation({
    mutationFn: (params: { id: string; quantite: number }) => definirStockInitial(params.id, params.quantite),
    onSuccess: invalidateStock,
  });

  const validerInventaire = useMutation({
    mutationFn: (params: {
      lignes: { couleur: ChaussureInventaire['couleur']; taille: ChaussureInventaire['taille']; quantite_comptee: number }[];
      profileId: string;
    }) => enregistrerInventaire(params.lignes, params.profileId, popUpId as string),
    onSuccess: invalidateInventaires,
  });

  return { definirStock, validerInventaire };
}
