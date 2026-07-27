import { Redirect, Slot } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarreNavigationBasse, HAUTEUR_BARRE_NAVIGATION_BASSE } from '@/components/nav/BarreNavigationBasse';
import { MenuLateral } from '@/components/nav/MenuLateral';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';

export default function AppLayout() {
  const { session, initializing, init } = useAuthStore();
  const profileReel = useAuthStore((s) => s.profile);
  const vue = useVueAdminStore((s) => s.vue);
  const insets = useSafeAreaInsets();

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

  // Le tiroir latéral reste la navigation admin (et web, pas dans le périmètre de cette barre
  // basse) ; les non-admins (et un admin qui prévisualise en "alternant") ont la barre d'onglets
  // basse façon Combo à la place.
  const estAdminEnVueAdmin = profileReel?.role === 'admin' && vue === 'admin';

  if (Platform.OS === 'web' || estAdminEnVueAdmin) {
    return (
      <View style={{ flex: 1 }}>
        <Slot />
        <MenuLateral />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, paddingBottom: HAUTEUR_BARRE_NAVIGATION_BASSE + insets.bottom }}>
        <Slot />
      </View>
      <BarreNavigationBasse />
    </View>
  );
}
