import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { fetchSaisiesCommande, supprimerSaisiesCommande, validerSaisieCommande } from '@/api/saisiesCommande';
import { supabase } from '@/api/supabaseClient';
import type { CategorieSaisieStock } from '@/types/database.types';

/** Saisies validées du pop-up, en temps réel : quand un collègue valide une catégorie sur son
 * téléphone, la case passe au vert chez tout le monde. */
export function useSaisiesCommande(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['stock-saisies-commande', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`stock-saisies-commande-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_saisies_commande', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, popUpId, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchSaisiesCommande(popUpId as string),
    enabled: !!popUpId,
  });
}

export function useGererSaisiesCommande(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalider = () => queryClient.invalidateQueries({ queryKey: ['stock-saisies-commande', popUpId] });

  const valider = useMutation({
    mutationFn: (params: {
      categorie: CategorieSaisieStock;
      quantites: Record<string, number>;
      descriptionAutre?: string | null;
      profileId: string;
    }) => validerSaisieCommande({ popUpId: popUpId as string, ...params }),
    onSuccess: invalider,
  });

  const supprimer = useMutation({
    mutationFn: (categories: CategorieSaisieStock[]) => supprimerSaisiesCommande(popUpId as string, categories),
    onSuccess: invalider,
  });

  return { valider, supprimer };
}
