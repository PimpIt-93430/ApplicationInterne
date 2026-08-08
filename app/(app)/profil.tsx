import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { signOut } from '@/api/auth';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { ModalInviterPersonne } from '@/components/profil/ModalInviterPersonne';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';

const LIBELLE_TYPE_CONTRAT: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

export default function ProfilScreen() {
  // Profil réel : contrôle le sélecteur de vue et reste toujours visible pour qu'un admin en
  // train de prévisualiser puisse revenir en arrière. Profil affiché : Namory en vue alternant,
  // sinon identique au profil réel — c'est lui qui pilote tout le reste de l'écran.
  const profileReel = useAuthStore((s) => s.profile);
  const profile = useProfilEffectif();
  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();

  const estAdminReel = profileReel?.role === 'admin';
  const estAdminAffiche = profile?.role === 'admin';
  const estAlternant = profile?.type_contrat === 'alternant';
  const estManager = profile?.type_contrat === 'manager';
  const { vue, definirVue } = useVueAdminStore();
  // Comme le reste des actions admin (cf. estAdminEnVueAdmin ailleurs) : masqué quand l'admin
  // prévisualise en "vue alternant"/"vue manager", pour rester fidèle à ce que cette personne voit.
  const estAdminEnVueAdmin = estAdminReel && vue === 'admin';
  const [inviterOuvert, setInviterOuvert] = useState(false);

  // Nom du lieu affiché à côté du rôle (ex. "Manager · Val d'Europe") — le premier lieu attribué,
  // pas pertinent pour un admin (attribué à tous, cf. estAttribueA).
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const monPopUp =
    profile && !estAdminAffiche ? popUpsAttribues(profile, mapAffectations, popUpsTous ?? [])[0] : undefined;

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <View className="flex-1 bg-white">
      <EnteteMenu titre={estAdminAffiche ? 'Profil' : 'Paramètres'} />
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
        {estAdminAffiche ? ' · Administrateur' : ''}
        {monPopUp ? ` · ${monPopUp.nom}` : ''}
      </Text>

      {estAdminReel && (
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
            <Pressable
              onPress={() => definirVue('manager')}
              className={`flex-1 items-center rounded-lg py-2 ${vue === 'manager' ? 'bg-white' : ''}`}
            >
              <Text className={vue === 'manager' ? 'font-semibold text-indigo-600' : 'text-slate-500'}>
                Manager
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <View className="mb-6 gap-2">
        {(estAlternant || estManager || estAdminReel) && (
          <Link href="/(app)/alternance" asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Text className="text-base text-slate-800">Calendrier d'école</Text>
              <Text className="text-slate-300">›</Text>
            </Pressable>
          </Link>
        )}
        {estAdminEnVueAdmin && (
          <Pressable
            onPress={() => setInviterOuvert(true)}
            className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <Text className="text-base text-slate-800">Inviter une personne</Text>
            <Text className="text-slate-300">›</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={handleSignOut}
        className="items-center rounded-xl border border-red-200 bg-red-50 py-3"
      >
        <Text className="text-base font-semibold text-red-600">Se déconnecter</Text>
      </Pressable>
      </ScrollView>

      {inviterOuvert && <ModalInviterPersonne onFermer={() => setInviterOuvert(false)} />}
    </View>
  );
}
