import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';

import { useAuthStore } from '@/store/useAuthStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';

const LARGEUR = 260;

export function MenuLateral() {
  const ouvert = useMenuStore((s) => s.ouvert);
  const fermer = useMenuStore((s) => s.fermer);
  const profile = useAuthStore((s) => s.profile);
  const vue = useVueAdminStore((s) => s.vue);
  const translateX = useRef(new Animated.Value(-LARGEUR)).current;

  const estAdmin = profile?.role === 'admin' && vue === 'admin';

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: ouvert ? 0 : -LARGEUR,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [ouvert, translateX]);

  const liens = [
    { label: 'Stock', route: estAdmin ? '/(app)/admin/stock' : '/(app)/stock' },
    { label: 'Calendrier', route: estAdmin ? '/(app)/admin/calendrier' : '/(app)/calendrier' },
    { label: 'Profil', route: '/(app)/profil' },
    ...(estAdmin
      ? [
          { label: 'Pop-up', route: '/(app)/admin/popups' },
          { label: 'Équipe', route: '/(app)/admin/equipe' },
        ]
      : []),
  ] as const;

  const allerA = (route: string) => {
    fermer();
    router.push(route as Parameters<typeof router.push>[0]);
  };

  return (
    <>
      {ouvert && (
        <Pressable
          onPress={fermer}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            zIndex: 20,
          }}
        />
      )}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: LARGEUR,
          zIndex: 30,
          backgroundColor: 'white',
          paddingTop: 64,
          paddingHorizontal: 12,
          transform: [{ translateX }],
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 2, height: 0 },
          elevation: 8,
        }}
      >
        <Text className="mb-4 px-3 text-xs font-semibold uppercase text-slate-400">Menu</Text>
        {liens.map((lien) => (
          <Pressable key={lien.route} onPress={() => allerA(lien.route)} className="rounded-xl px-3 py-3">
            <Text className="text-base font-semibold text-slate-800">{lien.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </>
  );
}
