import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { useGererJoursEcole, useJoursEcoleProfile } from '@/hooks/useAlternance';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useAuthStore } from '@/store/useAuthStore';
import { useSemaineStore } from '@/store/useSemaineStore';
import { dateEnISO, joursDeLaSemaine, libelleJourCourt, nomJourCourt, numeroJour } from '@/utils/dateUtils';

export default function AlternanceScreen() {
  const profile = useAuthStore((s) => s.profile);
  const estAlternant = profile?.type_contrat === 'alternant';
  const estAdmin = profile?.role === 'admin';

  const { data: profils } = useActiveProfiles();
  const alternants = (profils ?? []).filter((p) => p.type_contrat === 'alternant');

  const [profileCibleId, setProfileCibleId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (profileCibleId) return;
    if (estAlternant && profile) {
      setProfileCibleId(profile.id);
    } else if (estAdmin && alternants.length > 0) {
      setProfileCibleId(alternants[0].id);
    }
  }, [estAlternant, estAdmin, profile, alternants, profileCibleId]);

  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();
  const jours = joursDeLaSemaine(dateReference);

  const { data: joursEcole, isLoading } = useJoursEcoleProfile(profileCibleId);
  const { ajouter, supprimer } = useGererJoursEcole(profileCibleId);

  if (!estAlternant && !estAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-slate-400">Cet écran concerne les alternants.</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white pt-14" contentContainerStyle={{ padding: 16 }}>
      <Text className="mb-1 text-2xl font-bold text-slate-900">Calendrier d'école</Text>
      <Text className="mb-4 text-sm text-slate-400">
        Cochez les jours où la personne est en cours (elle ne sera jamais planifiée ce jour-là).
      </Text>

      {estAdmin && alternants.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <View className="flex-row gap-2">
            {alternants.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setProfileCibleId(a.id)}
                className={`rounded-full px-3 py-2 ${profileCibleId === a.id ? 'bg-indigo-600' : 'bg-slate-100'}`}
              >
                <Text className={profileCibleId === a.id ? 'text-sm font-semibold text-white' : 'text-sm text-slate-600'}>
                  {a.nom_complet || a.email}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      <View className="mb-3 flex-row items-center justify-between">
        <Pressable onPress={semainePrecedente} className="px-3 py-2">
          <Text className="text-lg text-indigo-600">‹</Text>
        </Pressable>
        <Pressable onPress={revenirAujourdhui}>
          <Text className="text-base font-semibold text-slate-800">
            {libelleJourCourt(jours[0])} — {libelleJourCourt(jours[6])}
          </Text>
        </Pressable>
        <Pressable onPress={semaineSuivante} className="px-3 py-2">
          <Text className="text-lg text-indigo-600">›</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#6366F1" />
      ) : (
        <View className="flex-row flex-wrap justify-between gap-y-2">
          {jours.map((jour) => {
            const dateIso = dateEnISO(jour);
            const existant = joursEcole?.find((j) => j.date === dateIso);

            return (
              <Pressable
                key={dateIso}
                onPress={() => {
                  if (existant) {
                    supprimer.mutate(existant.id);
                  } else if (profileCibleId) {
                    ajouter.mutate(dateIso);
                  }
                }}
                className={`w-[13%] items-center rounded-xl border py-2 ${
                  existant ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'
                }`}
              >
                <Text className="text-[10px] text-slate-400">{nomJourCourt(jour)}</Text>
                <Text className={`text-sm font-bold ${existant ? 'text-amber-600' : 'text-slate-700'}`}>
                  {numeroJour(jour)}
                </Text>
                {existant && <Text className="text-[9px] text-amber-600">École</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
