import { Redirect, Slot } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { MenuLateral } from '@/components/nav/MenuLateral';
import { useAuthStore } from '@/store/useAuthStore';

export default function AppLayout() {
  const { session, initializing, init } = useAuthStore();

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

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      <MenuLateral />
    </View>
  );
}
