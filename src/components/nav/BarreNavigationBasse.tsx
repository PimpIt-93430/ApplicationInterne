import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NomIcone = keyof typeof Ionicons.glyphMap;

interface Onglet {
  label: string;
  route: '/(app)' | '/(app)/calendrier' | '/(app)/stock' | '/(app)/demandes' | '/(app)/profil';
  iconeInactive: NomIcone;
  iconeActive: NomIcone;
}

const ONGLETS: Onglet[] = [
  { label: 'Accueil', route: '/(app)', iconeInactive: 'home-outline', iconeActive: 'home' },
  {
    label: 'Planning',
    route: '/(app)/calendrier',
    iconeInactive: 'calendar-outline',
    iconeActive: 'calendar',
  },
  { label: 'Stock', route: '/(app)/stock', iconeInactive: 'cube-outline', iconeActive: 'cube' },
  {
    label: 'Demandes',
    route: '/(app)/demandes',
    iconeInactive: 'document-text-outline',
    iconeActive: 'document-text',
  },
  { label: 'Profil', route: '/(app)/profil', iconeInactive: 'person-outline', iconeActive: 'person' },
];

// Route de expo-router sans le segment de groupe "(app)" (usePathname() ne le renvoie jamais) —
// même helper que EnteteMenu.tsx, dupliqué ici plutôt qu'importé (composants de nav sans lien).
function routeSansGroupe(route: string): string {
  const sansGroupe = route.replace('/(app)', '');
  return sansGroupe === '' ? '/' : sansGroupe;
}

export function BarreNavigationBasse() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingBottom: insets.bottom || 12 }}
      className="flex-row border-t border-slate-100 bg-white px-2 pt-2"
    >
      {ONGLETS.map((onglet) => {
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
            <Text className={`text-[11px] font-semibold ${actif ? 'text-indigo-600' : 'text-slate-400'}`}>
              {onglet.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const HAUTEUR_BARRE_NAVIGATION_BASSE = 56;
