import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { fetchShiftsSemaine } from '@/api/planning';
import { supabase } from '@/api/supabaseClient';

export function useShiftsSemaine(dateDebut: string, dateFin: string) {
  const queryClient = useQueryClient();
  const queryKey = ['planning-shifts', dateDebut, dateFin];
  // Identifiant unique par instance du hook : plusieurs écrans (Planning, Génération...)
  // peuvent être montés en même temps avec la même semaine, il faut éviter que deux
  // abonnements Realtime partagent le même nom de canal.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    const channel = supabase
      .channel(`planning-shifts-${dateDebut}-${dateFin}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'planning_shifts' },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateDebut, dateFin, queryClient, instanceId]);

  return useQuery({
    queryKey,
    queryFn: () => fetchShiftsSemaine(dateDebut, dateFin),
  });
}
