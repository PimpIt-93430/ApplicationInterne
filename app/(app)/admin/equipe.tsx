import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { HoraireRecurrentJourCard } from '@/components/reglages/HoraireRecurrentJourCard';
import { useHorairesOuverture } from '@/hooks/useReglesMetier';
import { useEnregistrerHoraireRecurrent, useHorairesRecurrents } from '@/hooks/useHorairesRecurrents';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { JOURS_LABELS } from '@/utils/dateUtils';
import type { PopUp, Profile } from '@/types/database.types';

const LIBELLE_TYPE_CONTRAT: Record<string, string> = {
  manager: 'Manager',
  employe: 'Employé',
  alternant: 'Alternant',
};

function CarteMembre({ profil, popUp }: { profil: Profile; popUp: PopUp | undefined }) {
  const [ouvert, setOuvert] = useState(false);

  const { data: horaires, isLoading: chargementHoraires } = useHorairesRecurrents(
    ouvert ? profil.id : undefined,
  );
  const { data: horairesPopUp } = useHorairesOuverture(ouvert ? popUp?.id : undefined);
  const enregistrer = useEnregistrerHoraireRecurrent();

  const copierHorairesPopUp = () => {
    if (!horairesPopUp) return;
    for (const h of horairesPopUp) {
      if (!h.actif) continue;
      enregistrer.mutate({
        profile_id: profil.id,
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
        {popUp ? ` · ${popUp.nom}` : ' · Aucun pop-up attribué'}
      </Text>

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
          </Text>

          {popUp && (
            <Pressable
              onPress={copierHorairesPopUp}
              className="mb-3 items-center rounded-lg border border-dashed border-indigo-300 py-2"
            >
              <Text className="text-xs font-semibold text-indigo-600">
                Copier les horaires d'ouverture de {popUp.nom}
              </Text>
            </Pressable>
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

  const popUpParId = new Map((popUps ?? []).map((p) => [p.id, p]));
  const membres = (profils ?? []).filter((p) => p.role !== 'admin');

  if (chargementProfils || chargementPopUps) {
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
          Les admins décident toujours manuellement de leur planning. Pour tout le monde
          d'autre, l'horaire récurrent ci-dessous pilote la génération automatique.
        </Text>

        {membres.length === 0 && (
          <Text className="text-sm text-slate-400">Aucun membre (hors admins) pour l'instant.</Text>
        )}

        {membres.map((profil) => (
          <CarteMembre key={profil.id} profil={profil} popUp={popUpParId.get(profil.pop_up_id ?? '')} />
        ))}
      </ScrollView>
    </View>
  );
}
