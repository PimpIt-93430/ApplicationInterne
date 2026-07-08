import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '@/store/useAuthStore';

export default function Index() {
  const { session, profile, initializing, init } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href={profile?.role === 'admin' ? '/(app)/admin/calendrier' : '/(app)/calendrier'} />;
}
