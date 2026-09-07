import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  annulerCommandeProduits,
  basculerLigneCommandeProduitFait,
  basculerToutesLignesCommandeProduits,
  envoyerCommandeProduits,
  fetchCommandeActiveProduits,
  fetchCommandeDetailProduits,
  fetchCommandesEnAttenteLocalProduits,
  fetchCommandesTermineesProduits,
  marquerCommandeProduitsEnvoyee,
  marquerCommandeProduitsRecue,
  type CommandeProduitsAvecLignes,
} from '@/api/produits';
import { supabase } from '@/api/supabaseClient';
import type { CategorieProduit } from '@/types/database.types';

// Commande de Produits en cours pour ce pop-up — realtime pour que le statut se mette à jour sans
// recharger l'écran (même pattern que useCommandeActivePopUp/useCommandeActiveConsommables).
export function useCommandeActiveProduits(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['produits-commande-active', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`produits-commande-active-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commandes_produits', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: () => fetchCommandeActiveProduits(popUpId as string), enabled: !!popUpId });
}

// Onglet "Commandes" du Local : toutes les commandes de Produits en attente, tous pop-ups confondus.
export function useCommandesEnAttenteLocalProduits() {
  const queryClient = useQueryClient();
  const queryKey = ['produits-commandes-local'];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`produits-commandes-local-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes_produits' }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, instanceId]);

  return useQuery({ queryKey, queryFn: fetchCommandesEnAttenteLocalProduits });
}

// Historique des commandes de Produits d'un pop-up.
export function useCommandesTermineesProduits(popUpId: string | undefined) {
  return useQuery({
    queryKey: ['produits-commandes-terminees', popUpId],
    queryFn: () => fetchCommandesTermineesProduits(popUpId as string),
    enabled: !!popUpId,
  });
}

// Détail d'une commande en préparation (écran du local) — realtime patché ligne par ligne, même
// pattern que useCommandeDetail (pin's) pour éviter tout re-rendu de toute la liste à chaque coche.
export function useCommandeDetailProduits(commandeId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['produits-commande-detail', commandeId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!commandeId) return;
    const channel = supabase
      .channel(`produits-commande-detail-${commandeId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'commande_produits_lignes', filter: `commande_id=eq.${commandeId}` },
        (payload) => {
          const nouvelleLigne = payload.new as { id: string; fait: boolean };
          queryClient.setQueryData<(CommandeProduitsAvecLignes & { popUpNom: string }) | undefined>(queryKey, (old) =>
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
    queryFn: () => fetchCommandeDetailProduits(commandeId as string),
    enabled: !!commandeId,
  });
}

// Côté pop-up : envoyer une demande de Produits, l'annuler tant que pas prise en charge, confirmer
// la réception une fois récupérée.
export function useGererCommandeProduits(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateActive = () => queryClient.invalidateQueries({ queryKey: ['produits-commande-active', popUpId] });

  const envoyer = useMutation({
    mutationFn: (params: {
      profileId: string;
      lignes: { categorie: CategorieProduit; produitId: string; libelle: string; quantite: number }[];
    }) => envoyerCommandeProduits({ popUpId: popUpId as string, ...params }),
    onSuccess: () => {
      invalidateActive();
      queryClient.invalidateQueries({ queryKey: ['produits-commandes-terminees', popUpId] });
    },
  });

  const annuler = useMutation({
    mutationFn: (commandeId: string) => annulerCommandeProduits(commandeId),
    onSuccess: () => {
      invalidateActive();
      queryClient.invalidateQueries({ queryKey: ['produits-commandes-terminees', popUpId] });
    },
  });

  const marquerRecue = useMutation({
    mutationFn: (params: { commandeId: string; profileId: string }) => marquerCommandeProduitsRecue(params),
    onSuccess: () => {
      invalidateActive();
      queryClient.invalidateQueries({ queryKey: ['produits-commandes-terminees', popUpId] });
    },
  });

  return { envoyer, annuler, marquerRecue };
}

// Côté local : préparer une commande de Produits (cocher ligne par ligne), puis la marquer envoyée.
export function useGererPreparationCommandeProduits() {
  const queryClient = useQueryClient();

  const patchLigneFait = (commandeId: string, ligneId: string, fait: boolean) => {
    queryClient.setQueryData<(CommandeProduitsAvecLignes & { popUpNom: string }) | undefined>(
      ['produits-commande-detail', commandeId],
      (old) => (old ? { ...old, lignes: old.lignes.map((l) => (l.id === ligneId ? { ...l, fait } : l)) } : old),
    );
  };

  const basculerFait = useMutation({
    mutationFn: (params: { ligneId: string; commandeId: string; fait: boolean }) =>
      basculerLigneCommandeProduitFait(params.ligneId, params.fait),
    onMutate: (params) => patchLigneFait(params.commandeId, params.ligneId, params.fait),
    onError: (_err, params) => patchLigneFait(params.commandeId, params.ligneId, !params.fait),
  });

  const basculerTout = useMutation({
    mutationFn: (params: { commandeId: string; fait: boolean }) =>
      basculerToutesLignesCommandeProduits(params.commandeId, params.fait),
    onMutate: (params) => {
      queryClient.setQueryData<(CommandeProduitsAvecLignes & { popUpNom: string }) | undefined>(
        ['produits-commande-detail', params.commandeId],
        (old) => (old ? { ...old, lignes: old.lignes.map((l) => ({ ...l, fait: params.fait })) } : old),
      );
    },
    onError: (_err, params) => {
      queryClient.invalidateQueries({ queryKey: ['produits-commande-detail', params.commandeId] });
    },
  });

  const marquerEnvoyee = useMutation({
    mutationFn: (params: { commandeId: string; profileId: string }) => marquerCommandeProduitsEnvoyee(params),
    onSuccess: (_data, params) => {
      queryClient.invalidateQueries({ queryKey: ['produits-commandes-local'] });
      queryClient.invalidateQueries({ queryKey: ['produits-commande-detail', params.commandeId] });
    },
  });

  return { basculerFait, basculerTout, marquerEnvoyee };
}
