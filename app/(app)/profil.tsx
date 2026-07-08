import { Link, router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { signOut } from '@/api/auth';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';

const LIBELLE_TYPE_CONTRAT: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

export default function ProfilScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { data: notifications } = useNotifications(profile?.id);
  const nonLues = notifications?.filter((n) => !n.lu).length ?? 0;

  const estAdmin = profile?.role === 'admin';
  const estAlternant = profile?.type_contrat === 'alternant';
  const { vue, definirVue } = useVueAdminStore();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-white">
      <EnteteMenu titre={estAdmin ? 'Profil' : 'Paramètres'} />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 24 }}>
      <View
        className="mb-4 h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: profile?.couleur ?? '#6366F1' }}
      >
        <Text className="text-xl font-bold text-white">
          {(profile?.nom_complet || profile?.email || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <Text className="text-2xl font-bold text-slate-900">
        {profile?.nom_complet || 'Sans nom'}
      </Text>
      <Text className="mb-1 text-base text-slate-500">{profile?.email}</Text>
      <Text className="mb-8 text-sm uppercase tracking-wide text-indigo-600">
        {profile ? LIBELLE_TYPE_CONTRAT[profile.type_contrat] : ''}
        {estAdmin ? ' · Administrateur' : ''}
      </Text>

      {estAdmin && (
        <View className="mb-6">
          <Text className="mb-2 text-sm font-semibold text-slate-500">Mode d'affichage</Text>
          <View className="flex-row rounded-xl bg-slate-100 p-1">
            <Pressable
              onPress={() => definirVue('admin')}
              className={`flex-1 items-center rounded-lg py-2 ${vue === 'admin' ? 'bg-white' : ''}`}
            >
              <Text className={vue === 'admin' ? 'font-semibold text-indigo-600' : 'text-slate-500'}>
                Admin
              </Text>
            </Pressable>
            <Pressable
              onPress={() => definirVue('alternant')}
              className={`flex-1 items-center rounded-lg py-2 ${vue === 'alternant' ? 'bg-white' : ''}`}
            >
              <Text className={vue === 'alternant' ? 'font-semibold text-indigo-600' : 'text-slate-500'}>
                Alternant
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View className="mb-6 gap-2">
        {(estAlternant || estAdmin) && (
          <Link href="/(app)/alternance" asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Text className="text-base text-slate-800">Calendrier d'école</Text>
              <Text className="text-slate-300">›</Text>
            </Pressable>
          </Link>
        )}

        <Link href="/(app)/notifications" asChild>
          <Pressable className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
            <Text className="text-base text-slate-800">Notifications</Text>
            <View className="flex-row items-center gap-2">
              {nonLues > 0 && (
                <View className="min-w-[20px] items-center rounded-full bg-red-500 px-1.5 py-0.5">
                  <Text className="text-xs font-bold text-white">{nonLues}</Text>
                </View>
              )}
              <Text className="text-slate-300">›</Text>
            </View>
          </Pressable>
        </Link>
      </View>

      <Pressable
        onPress={handleSignOut}
        className="items-center rounded-xl border border-red-200 bg-red-50 py-3"
      >
        <Text className="text-base font-semibold text-red-600">Se déconnecter</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}
