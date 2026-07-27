import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';

import { useMesDroits } from '@/hooks/useDroits';
import { useAuthStore } from '@/store/useAuthStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import { aAccesFonctionnalite } from '@/utils/permissions';

const LARGEUR = 280;

export type NomIcone = keyof typeof Ionicons.glyphMap;
export type LienNavigation = { label: string; route: string; icone: NomIcone };

// Partagé entre MenuLateral (tiroir mobile) et EnteteMenu (barre horizontale web) pour que les
// deux navigations restent toujours synchronisées. Les deux plateformes n'affichent pas
// exactement les mêmes liens/ordre (cf. ci-dessous) — Accueil reste mobile uniquement (pas
// d'équivalent web, la barre web sert déjà de point d'entrée), et le web met Calendrier en
// premier / Profil en dernier.
//
// Finance reste strictement réservé aux admins (décision explicite, migration 0035) : pas de
// paramètre de droit ici, contrairement à Calendrier et Équipe où un non-admin peut avoir un
// droit "responsable de pop-up" (routes `/(app)/calendrier` et `/(app)/equipe`, inchangées pour
// les admins ; `calendrier.web.tsx`/`equipe.web.tsx` s'adaptent tout seuls selon leur propre
// droit — migrations 0034/0038).
export function liensNavigation(estAdmin: boolean, aDroitEquipe = false): LienNavigation[] {
  const calendrier: LienNavigation = {
    label: 'Calendrier',
    route: estAdmin ? '/(app)/admin/calendrier' : '/(app)/calendrier',
    icone: 'calendar-outline',
  };
  const stock: LienNavigation = {
    label: 'Stock',
    route: estAdmin ? '/(app)/admin/stock' : '/(app)/stock',
    icone: 'cube-outline',
  };
  const profil: LienNavigation = { label: 'Profil', route: '/(app)/profil', icone: 'person-outline' };
  // Web uniquement (equipe.web.tsx) : pas d'écran mobile équivalent pour l'instant, même
  // convention que Finance ci-dessous.
  const equipeManager: LienNavigation | null =
    Platform.OS === 'web' && !estAdmin && aDroitEquipe
      ? { label: 'Équipe', route: '/(app)/equipe', icone: 'people-outline' }
      : null;
  const liensAdmin: LienNavigation[] = estAdmin
    ? [
        { label: 'Pop-up', route: '/(app)/admin/popups', icone: 'storefront-outline' },
        { label: 'Équipe', route: '/(app)/admin/equipe', icone: 'people-outline' },
        // Web uniquement (admin/finance.web.tsx) : pas d'écran mobile équivalent pour l'instant.
        ...(Platform.OS === 'web'
          ? [{ label: 'Finance', route: '/(app)/admin/finance', icone: 'cash-outline' } as LienNavigation]
          : []),
      ]
    : [];

  if (Platform.OS === 'web') {
    return [calendrier, stock, ...liensAdmin, ...(equipeManager ? [equipeManager] : []), profil];
  }

  return [
    { label: 'Accueil', route: '/(app)', icone: 'home-outline' },
    stock,
    calendrier,
    profil,
    ...liensAdmin,
    ...(equipeManager ? [equipeManager] : []),
  ];
}

export function MenuLateral() {
  const ouvert = useMenuStore((s) => s.ouvert);
  const fermer = useMenuStore((s) => s.fermer);
  const profile = useAuthStore((s) => s.profile);
  const vue = useVueAdminStore((s) => s.vue);
  const translateX = useRef(new Animated.Value(-LARGEUR)).current;

  const estAdmin = profile?.role === 'admin' && vue === 'admin';
  const { data: mesDroits } = useMesDroits(profile?.id);
  const aDroitEquipe = aAccesFonctionnalite(mesDroits ?? [], 'equipe');

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: ouvert ? 0 : -LARGEUR,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [ouvert, translateX]);

  const liens = liensNavigation(estAdmin, aDroitEquipe);

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
            backgroundColor: 'rgba(15,23,42,0.45)',
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
          transform: [{ translateX }],
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 12,
          shadowOffset: { width: 2, height: 0 },
          elevation: 8,
        }}
      >
        <View className="px-5 pb-5 pt-16">
          <View
            className="mb-3 h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: profile?.couleur ?? '#6366F1' }}
          >
            <Text className="text-xl font-bold text-white">
              {(profile?.nom_complet || profile?.email || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text numberOfLines={1} className="text-lg font-bold text-slate-900">
            {profile?.nom_complet || profile?.email || 'Mon compte'}
          </Text>
          {estAdmin && (
            <Text className="text-xs font-semibold uppercase text-indigo-500">Administrateur</Text>
          )}
        </View>

        <View className="h-px bg-slate-100" />

        <View className="px-3 pt-3">
          {liens.map((lien) => (
            <Pressable
              key={lien.route}
              onPress={() => allerA(lien.route)}
              style={({ pressed }) => (pressed ? { backgroundColor: '#f8fafc' } : undefined)}
              className="mb-1 flex-row items-center gap-3 rounded-xl px-3 py-3"
            >
              <View className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                <Ionicons name={lien.icone} size={18} color="#4338CA" />
              </View>
              <Text className="text-base font-semibold text-slate-800">{lien.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </>
  );
}
