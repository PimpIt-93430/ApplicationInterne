import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfilEffectif } from '@/hooks/useProfilEffectif';

type NomIcone = keyof typeof Ionicons.glyphMap;

interface Onglet {
  label: string;
  route: '/(app)/calendrier' | '/(app)/stock' | '/(app)/ventes' | '/(app)/demandes' | '/(app)/profil';
  iconeInactive: NomIcone;
  iconeActive: NomIcone;
}

// Pas d'onglet "Accueil" pour l'instant : inutile tant que Planning en fait office (première
// route après connexion, cf. redirection dans app/(app)/index.tsx).
const ONGLETS_BASE: Onglet[] = [
  {
    label: 'Planning',
    route: '/(app)/calendrier',
    iconeInactive: 'calendar-outline',
    iconeActive: 'calendar',
  },
  { label: 'Stock', route: '/(app)/stock', iconeInactive: 'cube-outline', iconeActive: 'cube' },
  {
    label: 'Demande & RH',
    route: '/(app)/demandes',
    iconeInactive: 'document-text-outline',
    iconeActive: 'document-text',
  },
  { label: 'Profil', route: '/(app)/profil', iconeInactive: 'person-outline', iconeActive: 'person' },
];

const ONGLET_VENTES: Onglet = {
  label: 'Ventes',
  route: '/(app)/ventes',
  iconeInactive: 'cash-outline',
  iconeActive: 'cash',
};

// Route de expo-router sans le segment de groupe "(app)" (usePathname() ne le renvoie jamais) —
// même helper que EnteteMenu.tsx, dupliqué ici plutôt qu'importé (composants de nav sans lien).
function routeSansGroupe(route: string): string {
  const sansGroupe = route.replace('/(app)', '');
  return sansGroupe === '' ? '/' : sansGroupe;
}

export function BarreNavigationBasse() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const profile = useProfilEffectif();

  // Onglet "Ventes" réservé aux managers et aux admins (cf. écran encaissement espèces, avec
  // sélecteur de pop-up pour un admin) — inséré juste après Stock, avant Demande & RH.
  const onglets =
    profile?.type_contrat === 'manager' || profile?.role === 'admin'
      ? [...ONGLETS_BASE.slice(0, 2), ONGLET_VENTES, ...ONGLETS_BASE.slice(2)]
      : ONGLETS_BASE;

  return (
    <View
      style={{ paddingBottom: insets.bottom || 12 }}
      className="flex-row border-t border-slate-100 bg-white px-2 pt-2"
    >
      {onglets.map((onglet) => {
        const actif = pathname === routeSansGroupe(onglet.route);
        return (
          <Pressable
            key={onglet.route}
            onPress={() => router.push(onglet.route)}
            className="flex-1 items-center gap-1 py-1"
          >
            <Ionicons
              name={actif ? onglet.iconeActive : onglet.iconeInactive}
              size={22}
              color={actif ? '#4F46E5' : '#94A3B8'}
            />
            <Text
              numberOfLines={1}
              className={`text-[11px] font-semibold ${actif ? 'text-indigo-600' : 'text-slate-400'}`}
            >
              {onglet.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const HAUTEUR_BARRE_NAVIGATION_BASSE = 56;
