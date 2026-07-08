import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { fetchNotifications, marquerNotificationLue } from '@/api/notifications';
import { supabase } from '@/api/supabaseClient';

export function useNotifications(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['notifications', profileId];
  // Identifiant unique par instance : ce hook est utilisé à la fois pour le badge (Profil)
  // et pour l'écran Notifications, potentiellement montés en même temps.
  const instanceId = useRef(Math.random().toString(36).slice(2)).current;

  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel(`notifications-${profileId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `profile_id=eq.${profileId}` },
        () => queryClient.invalidateQueries({ queryKey: ['notifications', profileId] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, queryClient, instanceId]);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchNotifications(profileId as string),
    enabled: !!profileId,
  });

  const marquerLue = async (id: string) => {
    await marquerNotificationLue(id);
    queryClient.invalidateQueries({ queryKey });
  };

  return { ...query, marquerLue };
}
