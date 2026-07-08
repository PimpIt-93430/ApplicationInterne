import { supabase } from './supabaseClient';
import type { Notification } from '@/types/database.types';

export async function fetchNotifications(profileId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function marquerNotificationLue(id: string) {
  const { error } = await supabase.from('notifications').update({ lu: true }).eq('id', id);
  if (error) throw error;
}

export async function creerNotifications(
  notifications: { profile_id: string; titre: string; corps: string }[],
) {
  if (notifications.length === 0) return;
  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) throw error;
}
