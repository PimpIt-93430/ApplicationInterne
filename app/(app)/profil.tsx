import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { signOut } from '@/api/auth';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import type { NomIcone } from '@/components/nav/MenuLateral';
import { ModalInviterPersonne } from '@/components/profil/ModalInviterPersonne';
import { Dropdown } from '@/components/ui/Dropdown';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { useVueAdminStore } from '@/store/useVueAdminStore';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';

const LIBELLE_TYPE_CONTRAT: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

type ItemMenu = { icone: NomIcone; label: string } & ({ href: string } | { onPress: () => void });

/** Un groupe de liens dans une seule carte, séparés par un simple filet — plutôt qu'une carte par
 * lien (ancienne version) : plus compact et plus lisible d'un coup d'œil. Cf. retour utilisateur
 * du 2026-09-04 : l'onglet Profil "est très moche". */
function SectionMenu({ titre, items }: { titre?: string; items: ItemMenu[] }) {
  if (items.length === 0) return null;
  return (
    <View className="mb-6">
      {titre && <Text className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">{titre}</Text>}
      <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {items.map((item, i) => {
          const contenu = (
            <View
              className={`flex-row items-center gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-indigo-50">
                <Ionicons name={item.icone} size={18} color="#4F46E5" />
              </View>
              <Text className="flex-1 text-base text-slate-800">{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
            </View>
          );
          if ('href' in item) {
            return (
              <Link key={item.label} href={item.href} asChild>
                <Pressable>{contenu}</Pressable>
              </Link>
            );
          }
          return (
            <Pressable key={item.label} onPress={item.onPress}>
              {contenu}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Badge({ label, couleurFond, couleurTexte }: { label: string; couleurFond: string; couleurTexte: string }) {
  return (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: couleurFond }}>
      <Text className="text-xs font-semibold uppercase" style={{ color: couleurTexte }}>
        {label}
      </Text>
    </View>
  );
}

export default function ProfilScreen() {
  // Profil réel : contrôle le sélecteur de vue et reste toujours visible pour qu'un admin en
  // train de prévisualiser puisse revenir en arrière. Profil affiché : Namory en vue alternant,
  // sinon identique au profil réel — c'est lui qui pilote tout le reste de l'écran.
  const profileReel = useAuthStore((s) => s.profile);
  const profile = useProfilEffectif();
  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const { data: profilsTous } = useActiveProfiles();

  const estAdminReel = profileReel?.role === 'admin';
  const estAdminAffiche = profile?.role === 'admin';
  const estAlternant = profile?.type_contrat === 'alternant';
  const estManager = profile?.type_contrat === 'manager';
  const { profilPreviewId, definirProfilPreview } = useVueAdminStore();
  // Comme le reste des actions admin (cf. estAdminEnVueAdmin ailleurs) : masqué quand l'admin
  // est connecté au profil de quelqu'un d'autre, pour rester fidèle à ce que cette personne voit.
  const estAdminEnVueAdmin = estAdminReel && !profilPreviewId;
  const [inviterOuvert, setInviterOuvert] = useState(false);

  // N'importe qui d'autre (pas soi-même) — l'admin peut se connecter à n'importe quel profil, pas
  // seulement un rôle générique, pour voir l'app exactement comme cette personne (cf. retour
  // utilisateur du 2026-08-24 : "je veux pouvoir aller sur tous les profils").
  const autresProfils = (profilsTous ?? []).filter((p) => p.id !== profileReel?.id);

  // Nom du lieu affiché à côté du rôle (ex. "Manager · Val d'Europe") — le premier lieu attribué,
  // pas pertinent pour un admin (attribué à tous, cf. estAttribueA).
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const monPopUp =
    profile && !estAdminAffiche ? popUpsAttribues(profile, mapAffectations, popUpsTous ?? [])[0] : undefined;

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const itemsGeneral: ItemMenu[] = [
    { icone: 'information-circle-outline', label: 'Afficher les informations', href: '/(app)/guides' },
    ...(estAlternant || estManager || estAdminReel
      ? [{ icone: 'school-outline' as NomIcone, label: "Calendrier d'école", href: '/(app)/alternance' }]
      : []),
    ...(estManager || estAdminAffiche
      ? [{ icone: 'trending-up-outline' as NomIcone, label: 'Objectif espèces', href: '/(app)/objectif-especes' }]
      : []),
  ];

  const itemsAdmin: ItemMenu[] = estAdminEnVueAdmin
    ? [
        { icone: 'person-add-outline', label: 'Inviter une personne', onPress: () => setInviterOuvert(true) },
        { icone: 'card-outline', label: 'SumUp', href: '/(app)/admin/sumup' },
        { icone: 'wallet-outline', label: 'Dépôts espèces', href: '/(app)/admin/depots-especes' },
      ]
    : [];

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre={estAdminAffiche ? 'Profil' : 'Paramètres'} />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View className="mb-6 flex-row items-center gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <View
            className="h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: profile?.couleur ?? '#6366F1' }}
          >
            <Text className="text-2xl font-bold text-white">
              {(profile?.nom_complet || profile?.email || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold text-slate-900" numberOfLines={1}>
              {profile?.nom_complet || 'Sans nom'}
            </Text>
            <Text className="mb-2 text-sm text-slate-400" numberOfLines={1}>
              {profile?.email}
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {profile && <Badge label={LIBELLE_TYPE_CONTRAT[profile.type_contrat] ?? profile.type_contrat} couleurFond="#EEF2FF" couleurTexte="#4F46E5" />}
              {estAdminAffiche && <Badge label="Administrateur" couleurFond="#FEF3C7" couleurTexte="#B45309" />}
              {monPopUp && <Badge label={monPopUp.nom} couleurFond="#F1F5F9" couleurTexte="#475569" />}
            </View>
          </View>
        </View>

        {estAdminReel && (
          <View className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <Ionicons name="swap-horizontal-outline" size={16} color="#64748B" />
              <Text className="text-sm font-semibold text-slate-600">Se connecter en tant que</Text>
            </View>
            <Dropdown
              value={profilPreviewId ?? 'moi'}
              options={[
                { value: 'moi', label: `Moi (${profileReel?.nom_complet || 'Admin'})` },
                ...autresProfils.map((p) => ({
                  value: p.id,
                  label: `${p.nom_complet || p.email} · ${LIBELLE_TYPE_CONTRAT[p.type_contrat] ?? p.type_contrat}`,
                  couleur: p.couleur,
                })),
              ]}
              onChange={(v) => definirProfilPreview(v === 'moi' ? null : v)}
            />
            {!!profilPreviewId && (
              <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-indigo-50 p-3">
                <Ionicons name="information-circle" size={16} color="#4F46E5" style={{ marginTop: 1 }} />
                <Text className="flex-1 text-xs leading-4 text-indigo-700">
                  Tu vois et agis actuellement avec le profil de {profile?.nom_complet || 'cette personne'} —
                  choisis "Moi" ci-dessus pour revenir à ton profil admin.
                </Text>
              </View>
            )}
          </View>
        )}

        <SectionMenu items={itemsGeneral} />
        <SectionMenu titre="Administration" items={itemsAdmin} />

        <Pressable
          onPress={handleSignOut}
          className="flex-row items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 py-3.5"
        >
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text className="text-base font-semibold text-red-600">Se déconnecter</Text>
        </Pressable>
      </ScrollView>

      {inviterOuvert && <ModalInviterPersonne onFermer={() => setInviterOuvert(false)} />}
    </View>
  );
}
