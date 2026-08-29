import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useAuthStore } from '@/store/useAuthStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';

function TuilePrincipale({
  label,
  sousTitre,
  icone,
  couleur,
  onPress,
}: {
  label: string;
  sousTitre: string;
  icone: keyof typeof Ionicons.glyphMap;
  couleur: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: couleur }}
      className="rounded-3xl p-6 shadow-md"
    >
      <View className="mb-8 h-14 w-14 items-center justify-center rounded-2xl bg-white/25">
        <Ionicons name={icone} size={28} color="white" />
      </View>
      <Text className="text-2xl font-bold text-white">{label}</Text>
      <Text className="mt-1 text-sm text-white/80">{sousTitre}</Text>
    </Pressable>
  );
}

function RaccourciSecondaire({
  label,
  icone,
  onPress,
}: {
  label: string;
  icone: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ width: '47%' }}
      className="flex-row items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
        <Ionicons name={icone} size={20} color="#475569" />
      </View>
      <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-slate-700">
        {label}
      </Text>
    </Pressable>
  );
}

/** Écran d'accueil : Stock doit être atteignable en un tap, le reste (Calendrier, Profil,
 * Équipe, Pop-up) est secondaire — présent ici en raccourcis discrets, et toujours accessible
 * via le menu latéral pour la navigation complète. */
export default function AccueilScreen() {
  const profileReel = useAuthStore((s) => s.profile);
  const profile = useProfilEffectif();
  const profilPreviewId = useVueAdminStore((s) => s.profilPreviewId);
  const ouvrirMenu = useMenuStore((s) => s.ouvrir);

  const estAdmin = profileReel?.role === 'admin' && !profilPreviewId;
  const premierPrenom = (profile?.nom_complet || '').trim().split(' ')[0];

  // Pas d'onglet "Accueil" dans la barre basse mobile (inutile pour l'instant, admin inclus
  // désormais) : Planning en tient lieu de première page après connexion. Seul le web garde cet
  // écran tel quel (tiroir + tuiles, pas dans le périmètre de la barre basse).
  if (Platform.OS !== 'web') {
    return <Redirect href="/(app)/calendrier" />;
  }

  return (
    <View className="flex-1 bg-slate-50">
      <View className="flex-row items-center justify-between px-6 pb-4 pt-16">
        <View>
          <Text className="text-sm text-slate-400">
            {premierPrenom ? `Bonjour, ${premierPrenom}` : 'Bonjour'} 👋
          </Text>
          <Text className="text-3xl font-bold text-slate-900">Pimp It</Text>
        </View>
        {estAdmin && (
          <Pressable
            onPress={ouvrirMenu}
            className="h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <Ionicons name="menu" size={22} color="#334155" />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <View className="gap-4">
          <TuilePrincipale
            label="Stock"
            sousTitre="Pin's, chaussures, commandes"
            icone="cube"
            couleur="#6366F1"
            onPress={() => router.push(estAdmin ? '/(app)/admin/stock' : '/(app)/stock')}
          />
        </View>

        <Text className="mb-3 mt-8 text-xs font-semibold uppercase text-slate-400">Plus</Text>
        <View className="flex-row flex-wrap gap-3">
          <RaccourciSecondaire
            label="Calendrier"
            icone="calendar-outline"
            onPress={() => router.push(estAdmin ? '/(app)/admin/calendrier' : '/(app)/calendrier')}
          />
          <RaccourciSecondaire
            label="Profil"
            icone="person-outline"
            onPress={() => router.push('/(app)/profil')}
          />
          {estAdmin && (
            <>
              <RaccourciSecondaire
                label="Équipe"
                icone="people-outline"
                onPress={() => router.push('/(app)/admin/equipe')}
              />
              <RaccourciSecondaire
                label="Pop-up"
                icone="storefront-outline"
                onPress={() => router.push('/(app)/admin/popups')}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
