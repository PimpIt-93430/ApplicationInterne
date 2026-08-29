import { Redirect, Slot } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { BarreNavigationBasse } from '@/components/nav/BarreNavigationBasse';
import { MenuLateral } from '@/components/nav/MenuLateral';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';

export default function AppLayout() {
  const { session, initializing, init } = useAuthStore();
  const profileReel = useAuthStore((s) => s.profile);
  const profilPreviewId = useVueAdminStore((s) => s.profilPreviewId);

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

  // Le tiroir latéral (MenuLateral) reste la navigation web dans tous les cas. Sur mobile, tout le
  // monde a maintenant la barre d'onglets basse façon Combo (Planning/Stock/Ventes/Demande &
  // RH/Profil) — y compris un admin en "vue admin" : le tiroir reste accessible en plus pour lui
  // via le ☰ de EnteteMenu sur les écrans admin/* (génération de planning, pop-up, équipe RH
  // complète, finance), qui ont besoin de plus que ce que la barre basse peut offrir.
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1 }}>
        <Slot />
        <MenuLateral />
      </View>
    );
  }

  const estAdminEnVueAdmin = profileReel?.role === 'admin' && !profilPreviewId;
  // Un manager a lui aussi le tiroir sur mobile désormais (Équipe scopée à son pop-up, cf.
  // MenuLateral/liensNavigation) — pas seulement un admin (retour utilisateur du 2026-08-24).
  const estManagerReel = profileReel?.type_contrat === 'manager' && !profilPreviewId;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <BarreNavigationBasse />
      {(estAdminEnVueAdmin || estManagerReel) && <MenuLateral />}
    </View>
  );
}
