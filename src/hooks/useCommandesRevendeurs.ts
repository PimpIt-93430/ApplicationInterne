import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  basculerLigneCommandeRevendeurFait,
  basculerToutesLignesCommandeRevendeur,
  fetchCommandeRevendeurDetail,
  fetchCommandesRevendeursEnAttenteLocal,
  marquerCommandeRevendeurTraitee,
  type CommandeRevendeurAvecLignes,
} from '@/api/commandesRevendeurs';
import { supabase } from '@/api/supabaseClient';

// Onglet "Commandes" du Local : commandes revendeurs pas encore traitées — même principe que
// useCommandesEnAttenteLocal (pin's, cf. hooks/useStock.ts).
export function useCommandesRevendeursEnAttenteLocal() {
  const queryClient = useQueryClient();
  const queryKey = ['revendeurs-commandes-local'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`revendeurs-commandes-local-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes_revendeurs' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchCommandesRevendeursEnAttenteLocal });
}

// Détail d'une commande en préparation — realtime patché ligne par ligne, même pattern que
// useCommandeDetail (pin's) pour éviter tout re-rendu de toute la liste à chaque coche.
export function useCommandeRevendeurDetail(commandeId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['revendeurs-commande-detail', commandeId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!commandeId) return;
    const channel = supabase
      .channel(`revendeurs-commande-detail-${commandeId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'commandes_revendeurs_lignes', filter: `commande_id=eq.${commandeId}` },
        (payload) => {
          const nouvelleLigne = payload.new as { id: string; fait: boolean };
          queryClient.setQueryData<CommandeRevendeurAvecLignes | undefined>(queryKey, (old) =>
            old
              ? { ...old, lignes: old.lignes.map((l) => (l.id === nouvelleLigne.id ? { ...l, fait: nouvelleLigne.fait } : l)) }
              : old,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [commandeId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchCommandeRevendeurDetail(commandeId as string),
    enabled: !!commandeId,
  });
}

// Côté local : préparer une commande revendeur (cocher ligne par ligne), puis la marquer traitée
// — même principe que useGererPreparationCommandeProduits.
export function useGererPreparationCommandeRevendeur() {
  const queryClient = useQueryClient();

  const patchLigneFait = (commandeId: string, ligneId: string, fait: boolean) => {
    queryClient.setQueryData<CommandeRevendeurAvecLignes | undefined>(
      ['revendeurs-commande-detail', commandeId],
      (old) => (old ? { ...old, lignes: old.lignes.map((l) => (l.id === ligneId ? { ...l, fait } : l)) } : old),
    );
  };

  const basculerFait = useMutation({
    mutationFn: (params: { ligneId: string; commandeId: string; fait: boolean }) =>
      basculerLigneCommandeRevendeurFait(params.ligneId, params.fait),
    onMutate: (params) => patchLigneFait(params.commandeId, params.ligneId, params.fait),
    onError: (_err, params) => patchLigneFait(params.commandeId, params.ligneId, !params.fait),
  });

  const basculerTout = useMutation({
    mutationFn: (params: { commandeId: string; fait: boolean }) =>
      basculerToutesLignesCommandeRevendeur(params.commandeId, params.fait),
    onMutate: (params) => {
      queryClient.setQueryData<CommandeRevendeurAvecLignes | undefined>(
        ['revendeurs-commande-detail', params.commandeId],
        (old) => (old ? { ...old, lignes: old.lignes.map((l) => ({ ...l, fait: params.fait })) } : old),
      );
    },
    onError: (_err, params) => {
      queryClient.invalidateQueries({ queryKey: ['revendeurs-commande-detail', params.commandeId] });
    },
  });

  const marquerTraitee = useMutation({
    mutationFn: (commandeId: string) => marquerCommandeRevendeurTraitee(commandeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['revendeurs-commandes-local'] });
    },
  });

  return { basculerFait, basculerTout, marquerTraitee };
}
