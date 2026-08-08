import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  useDemandesCalendrierEcoleEnAttente,
  useTraiterDemandeCalendrierEcole,
} from '@/hooks/useDemandesCalendrierEcole';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import type { DemandeAvecJours } from '@/api/demandesCalendrierEcole';

function formatDate(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'd MMM', { locale: fr });
}

/** Écran de validation admin des demandes de changement de calendrier école (cf. migration 0052 —
 * un alternant ne peut plus toucher directement à jours_ecole_alternant, il propose et l'admin
 * valide/refuse en bloc, plusieurs mois à la fois). */
export function PanneauValidationCalendrierEcole() {
  const { data: demandes, isLoading } = useDemandesCalendrierEcoleEnAttente();
  const { data: profils } = useActiveProfiles();
  const profileReel = useAuthStore((s) => s.profile);
  const traiter = useTraiterDemandeCalendrierEcole(profileReel?.id);

  const nomProfil = (profileId: string) =>
    (profils ?? []).find((p) => p.id === profileId)?.nom_complet ?? 'Personne inconnue';

  const traiterDemande = (item: DemandeAvecJours, statut: 'validee' | 'refusee') =>
    traiter.mutate({ ...item, statut });

  if (isLoading) {
    return <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />;
  }

  return (
    <View className="px-4">
      {(demandes ?? []).length === 0 ? (
        <View className="items-center py-16">
          <Text className="text-sm text-slate-400">Aucune demande en attente.</Text>
        </View>
      ) : (
        demandes!.map((item) => {
          const ajouts = item.jours.filter((j) => j.action === 'ajout').sort((a, b) => a.date.localeCompare(b.date));
          const suppressions = item.jours
            .filter((j) => j.action === 'suppression')
            .sort((a, b) => a.date.localeCompare(b.date));
          return (
            <View key={item.demande.id} className="mb-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <Text className="text-sm font-semibold text-slate-900">{nomProfil(item.demande.profile_id)}</Text>
              <Text className="mt-0.5 text-xs text-slate-400">
                {item.jours.length} changement{item.jours.length > 1 ? 's' : ''} proposé
                {item.jours.length > 1 ? 's' : ''}
              </Text>

              {ajouts.length > 0 && (
                <Text className="mt-2 text-xs text-emerald-600">
                  <Text className="font-semibold">+ École : </Text>
                  {ajouts.map((j) => formatDate(j.date)).join(', ')}
                </Text>
              )}
              {suppressions.length > 0 && (
                <Text className="mt-1 text-xs text-red-600">
                  <Text className="font-semibold">− École : </Text>
                  {suppressions.map((j) => formatDate(j.date)).join(', ')}
                </Text>
              )}

              <View className="mt-3 flex-row gap-3">
                <Pressable
                  onPress={() => traiterDemande(item, 'refusee')}
                  disabled={traiter.isPending}
                  className="flex-1 items-center rounded-xl border border-slate-200 py-2.5"
                >
                  <Text className="text-sm font-semibold text-slate-600">Refuser</Text>
                </Pressable>
                <Pressable
                  onPress={() => traiterDemande(item, 'validee')}
                  disabled={traiter.isPending}
                  className="flex-1 items-center rounded-xl bg-indigo-600 py-2.5"
                >
                  <Text className="text-sm font-semibold text-white">Valider</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
