import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/store/useAuthStore';

export default function NotificationsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { data: notifications, isLoading, marquerLue } = useNotifications(profile?.id);

  return (
    <ScrollView className="flex-1 bg-white pt-14" contentContainerStyle={{ padding: 16 }}>
      <Text className="mb-4 text-2xl font-bold text-slate-900">Notifications</Text>

      {isLoading ? (
        <ActivityIndicator color="#6366F1" />
      ) : notifications && notifications.length > 0 ? (
        notifications.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => !n.lu && marquerLue(n.id)}
            className={`mb-2 rounded-xl border p-3 ${n.lu ? 'border-slate-200 bg-white' : 'border-indigo-200 bg-indigo-50'}`}
          >
            <View className="flex-row items-center gap-2">
              {!n.lu && <View className="h-2 w-2 rounded-full bg-indigo-500" />}
              <Text className="text-sm font-semibold text-slate-800">{n.titre}</Text>
            </View>
            <Text className="mt-1 text-sm text-slate-500">{n.corps}</Text>
            <Text className="mt-1 text-xs text-slate-300">
              {new Date(n.created_at).toLocaleString('fr-FR')}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text className="text-sm text-slate-400">Aucune notification pour le moment.</Text>
      )}
    </ScrollView>
  );
}
