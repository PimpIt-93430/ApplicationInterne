import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { HoraireRecurrentJourCard } from '@/components/reglages/HoraireRecurrentJourCard';
import { useToutesHorairesOuverture } from '@/hooks/useReglesMetier';
import { useEnregistrerHoraireRecurrent, useHorairesRecurrents } from '@/hooks/useHorairesRecurrents';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles, useAffectationsPopUp, useModifierProfil } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import { JOURS_LABELS } from '@/utils/dateUtils';
import type { PopUp, Profile, Role } from '@/types/database.types';

const LIBELLE_TYPE_CONTRAT: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

function SelecteurRole({ profil }: { profil: Profile }) {
  const modifier = useModifierProfil();
  const soiMeme = useAuthStore((s) => s.profile)?.id === profil.id;

  const changerRole = (role: Role) => {
    if (role === profil.role) return;
    Alert.alert(
      role === 'admin' ? 'Passer admin' : 'Repasser employé',
      `${profil.nom_complet || 'Cette personne'} va ${role === 'admin' ? 'devenir admin' : 'perdre les droits admin'}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: () => modifier.mutate({ id: profil.id, changes: { role } }) },
      ],
    );
  };

  return (
    <View className="mb-3 flex-row items-center gap-2">
      <Text className="text-xs text-slate-400">Rôle</Text>
      {(['employe', 'admin'] as Role[]).map((role) => (
        <Pressable
          key={role}
          onPress={() => changerRole(role)}
          disabled={modifier.isPending || (soiMeme && profil.role === 'admin' && role === 'employe')}
          className={`rounded-full px-3 py-1.5 ${profil.role === role ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={`text-xs font-semibold ${profil.role === role ? 'text-white' : 'text-slate-600'}`}>
            {role === 'admin' ? 'Admin' : 'Employé'}
          </Text>
        </Pressable>
      ))}
      {soiMeme && profil.role === 'admin' && (
        <Text className="flex-1 text-[11px] text-slate-400">
          Un autre admin doit te repasser employé.
        </Text>
      )}
    </View>
  );
}

function CarteMembre({ profil, lieuxAttribues }: { profil: Profile; lieuxAttribues: PopUp[] }) {
  const [ouvert, setOuvert] = useState(false);

  const { data: horaires, isLoading: chargementHoraires } = useHorairesRecurrents(
    ouvert ? profil.id : undefined,
  );
  const { data: toutesHoraires } = useToutesHorairesOuverture();
  const enregistrer = useEnregistrerHoraireRecurrent();

  const copierHorairesPopUp = (lieu: PopUp) => {
    const horairesLieu = (toutesHoraires ?? []).filter((h) => h.pop_up_id === lieu.id);
    for (const h of horairesLieu) {
      if (!h.actif) continue;
      enregistrer.mutate({
        profile_id: profil.id,
        pop_up_id: lieu.id,
        jour_semaine: h.jour_semaine,
        heure_debut: h.heure_ouverture,
        heure_fin: h.heure_fermeture,
        actif: true,
      });
    }
  };

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <View className="mb-1 flex-row items-center gap-2">
        <View className="h-3 w-3 rounded-full" style={{ backgroundColor: profil.couleur }} />
        <Text className="flex-1 text-lg font-bold text-slate-900">{profil.nom_complet || profil.email}</Text>
      </View>
      <Text className="mb-3 text-sm text-slate-400">
        {LIBELLE_TYPE_CONTRAT[profil.type_contrat] ?? profil.type_contrat}
        {profil.role === 'admin' ? ' · Admin' : ''}
        {' · '}
        {profil.role === 'admin'
          ? 'Attribué à tous les lieux'
          : lieuxAttribues.length > 0
            ? lieuxAttribues.map((p) => p.nom).join(', ')
            : 'Aucun lieu attribué'}
      </Text>

      <SelecteurRole profil={profil} />

      <Pressable onPress={() => setOuvert((v) => !v)} className="mb-2">
        <Text className="text-sm font-semibold text-indigo-600">
          {ouvert ? "Masquer l'horaire" : "Voir / modifier l'horaire récurrent"}
        </Text>
      </Pressable>

      {ouvert && (
        <>
          <Text className="mb-2 text-xs text-slate-400">
            L'horaire habituel de {profil.nom_complet || 'cette personne'} : la génération
            automatique du planning s'en sert chaque semaine, sauf indisponibilité déclarée.
            {profil.role === 'admin'
              ? ' En tant qu\'admin, tous les lieux sont proposés ci-dessous.'
              : ' Seuls les lieux attribués (dans Pop-up) sont proposés ci-dessous.'}
          </Text>

          {lieuxAttribues.length === 0 && (
            <Text className="mb-3 text-xs text-red-500">
              Aucun lieu attribué pour l'instant — attribue d'abord cette personne à un pop-up
              (écran Pop-up) avant de fixer son horaire.
            </Text>
          )}

          {lieuxAttribues.length > 0 && (
            <View className="mb-3 gap-1.5">
              {lieuxAttribues.map((lieu) => (
                <Pressable
                  key={lieu.id}
                  onPress={() => copierHorairesPopUp(lieu)}
                  className="items-center rounded-lg border border-dashed border-indigo-300 py-2"
                >
                  <Text className="text-xs font-semibold text-indigo-600">
                    Copier les horaires d'ouverture de {lieu.nom}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {chargementHoraires ? (
            <ActivityIndicator color="#6366F1" />
          ) : (
            JOURS_LABELS.map((label, jourSemaine) => (
              <HoraireRecurrentJourCard
                key={jourSemaine}
                profileId={profil.id}
                jourSemaine={jourSemaine}
                label={label}
                regle={horaires?.find((h) => h.jour_semaine === jourSemaine)}
                popUpsDisponibles={lieuxAttribues}
                onEnregistrer={(horaire) => enregistrer.mutate(horaire)}
              />
            ))
          )}
        </>
      )}
    </View>
  );
}

export default function EquipeScreen() {
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations, isLoading: chargementAffectations } = useAffectationsPopUp();

  const mapAffectations = construireMapAffectations(affectations ?? []);
  const membres = profils ?? [];

  if (chargementProfils || chargementPopUps || chargementAffectations) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Équipe" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <Text className="mb-4 text-sm text-slate-400">
          L'horaire récurrent de chaque personne pilote la génération automatique du planning.
          Les admins sont attribués à tous les lieux par défaut (au local de 10h à 19h du lundi
          au samedi), mais peuvent toujours être placés à la main sur un pop-up un jour donné —
          ça prend le pas sur leur horaire par défaut ce jour-là.
        </Text>

        {membres.length === 0 && <Text className="text-sm text-slate-400">Aucun membre pour l'instant.</Text>}

        {membres.map((profil) => (
          <CarteMembre
            key={profil.id}
            profil={profil}
            lieuxAttribues={popUpsAttribues(profil, mapAffectations, popUps ?? [])}
          />
        ))}
      </ScrollView>
    </View>
  );
}
