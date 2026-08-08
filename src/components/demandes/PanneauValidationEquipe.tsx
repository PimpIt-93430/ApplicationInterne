import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useDemandesCongeEnAttente, useTraiterDemandeConge } from '@/hooks/useConges';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';

function formatDate(iso: string): string {
  return format(new Date(`${iso}T00:00:00`), 'd MMM yyyy', { locale: fr });
}

/** Onglet "Équipe" de Demande & RH (manager/admin uniquement) : demandes de congé en attente de
 * validation, tous profils confondus (RLS limite déjà à l'équipe du manager connecté, cf.
 * useDemandesCongeEnAttente). Les absences n'apparaissent jamais ici (auto-service, pas de
 * workflow de validation, cf. PanneauAbsences.tsx). */
export function PanneauValidationEquipe() {
  const { data: demandes, isLoading } = useDemandesCongeEnAttente();
  const { data: profils } = useActiveProfiles();
  const profileReel = useAuthStore((s) => s.profile);
  const traiter = useTraiterDemandeConge(profileReel?.id);

  const nomProfil = (profileId: string) =>
    (profils ?? []).find((p) => p.id === profileId)?.nom_complet ?? 'Personne inconnue';

  if (isLoading) {
    return <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />;
  }

  return (
    <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
      {(demandes ?? []).length === 0 ? (
        <View className="items-center py-16">
          <Text className="text-sm text-slate-400">Aucune demande en attente.</Text>
        </View>
      ) : (
        demandes!.map((conge) => (
          <View key={conge.id} className="mb-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <Text className="text-sm font-semibold text-slate-900">{nomProfil(conge.profile_id)}</Text>
            <Text className="mt-1 text-sm text-slate-500">
              {formatDate(conge.date_debut)}
              {conge.date_fin !== conge.date_debut ? ` → ${formatDate(conge.date_fin)}` : ''}
            </Text>
            {!!conge.note && <Text className="mt-1 text-xs text-slate-400">{conge.note}</Text>}

            <View className="mt-3 flex-row gap-3">
              <Pressable
                onPress={() => traiter.mutate({ conge, statut: 'refusee' })}
                disabled={traiter.isPending}
                className="flex-1 items-center rounded-xl border border-slate-200 py-2.5"
              >
                <Text className="text-sm font-semibold text-slate-600">Refuser</Text>
              </Pressable>
              <Pressable
                onPress={() => traiter.mutate({ conge, statut: 'validee' })}
                disabled={traiter.isPending}
                className="flex-1 items-center rounded-xl bg-indigo-600 py-2.5"
              >
                <Text className="text-sm font-semibold text-white">Valider</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}
