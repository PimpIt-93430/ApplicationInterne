import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { supabase } from '@/api/supabaseClient';
import { ajouterVenteEspece, annulerVenteEspece, fetchVentesEspecesPeriode, fetchVentesEspecesPopUp } from '@/api/ventesEspeces';

/** Plusieurs personnes du même pop-up peuvent avoir l'écran ouvert en même temps : abonnement
 * Realtime pour que l'ajout/l'annulation d'une vente par l'une apparaisse chez les autres sans
 * recharger, même principe que useShiftsSemaine. */
export function useVentesEspecesPopUp(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['ventes-especes', popUpId];
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!popUpId) return;
    const channel = supabase
      .channel(`ventes-especes-${popUpId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ventes_especes', filter: `pop_up_id=eq.${popUpId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popUpId, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchVentesEspecesPopUp(popUpId as string),
    enabled: !!popUpId,
  });
}

export function useVentesEspecesPeriode(dateDebut: string, dateFin: string) {
  return useQuery({
    queryKey: ['ventes-especes-periode', dateDebut, dateFin],
    queryFn: () => fetchVentesEspecesPeriode(dateDebut, dateFin),
  });
}

export function useGererVentesEspeces(popUpId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ventes-especes', popUpId] });

  const ajouter = useMutation({
    mutationFn: (params: { profileId: string; montant: number }) =>
      ajouterVenteEspece(popUpId as string, params.profileId, params.montant),
    onSuccess: invalidate,
    onError: (error: Error) => Alert.alert('Échec de l\'enregistrement', error.message),
  });

  const annuler = useMutation({
    mutationFn: (id: string) => annulerVenteEspece(id),
    onSuccess: invalidate,
    onError: (error: Error) => Alert.alert('Échec de l\'annulation', error.message),
  });

  return { ajouter, annuler };
}
