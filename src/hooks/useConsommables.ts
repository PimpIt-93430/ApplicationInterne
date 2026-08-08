import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import {
  basculerLigneConsommable,
  demanderConsommables,
  fetchCommandeActiveConsommables,
  marquerConsommablesEnvoyee,
  marquerConsommablesRecue,
  modifierDescriptionAutreConsommable,
} from '@/api/consommables';
import { supabase } from '@/api/supabaseClient';
import type { TypeConsommable } from '@/types/database.types';

// Commande de consommables en cours pour ce pop-up — realtime pour que le statut (demandée /
// envoyée / reçue) se mette à jour sans recharger l'écran.
export function useCommandeActiveConsommables(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['consommables-commande-active', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`consommables-commande-active-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'commandes_consommables', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchCommandeActiveConsommables(popUpId as string),
    enabled: !!popUpId,
  });
}

// Gestion complète du cycle demandée → envoyée → reçue, côté pop-up (demander/confirmer) et local
// (marquer envoyée) — même écran gère les deux rôles selon les droits de la personne connectée.
export function useGererCommandeConsommables(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateActive = () =>
    queryClient.invalidateQueries({ queryKey: ['consommables-commande-active', popUpId] });

  const demander = useMutation({
    mutationFn: (params: {
      profileId: string;
      lignes: { type: TypeConsommable; description: string | null }[];
    }) => demanderConsommables({ popUpId: popUpId as string, ...params }),
    onSuccess: invalidateActive,
  });

  const marquerEnvoyee = useMutation({
    mutationFn: (params: { commandeId: string; profileId: string }) => marquerConsommablesEnvoyee(params),
    onSuccess: invalidateActive,
  });

  const marquerRecue = useMutation({
    mutationFn: (params: { commandeId: string; profileId: string }) => marquerConsommablesRecue(params),
    onSuccess: invalidateActive,
  });

  // Ajouter/retirer un type sur une demande pas encore envoyée par le local — enregistré tout de
  // suite (pas de bouton "valider" séparé), verrouillé côté base dès que le local est passé dessus.
  const basculerLigne = useMutation({
    mutationFn: (params: {
      commandeId: string;
      type: TypeConsommable;
      description: string | null;
      inclus: boolean;
    }) => basculerLigneConsommable(params),
    onSuccess: invalidateActive,
  });

  const modifierDescriptionAutre = useMutation({
    mutationFn: (params: { commandeId: string; description: string | null }) =>
      modifierDescriptionAutreConsommable(params),
    onSuccess: invalidateActive,
  });

  return { demander, marquerEnvoyee, marquerRecue, basculerLigne, modifierDescriptionAutre };
}
