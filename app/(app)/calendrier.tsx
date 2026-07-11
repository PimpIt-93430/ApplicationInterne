import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AxeHeures } from '@/components/calendrier/AxeHeures';
import { PanneauIndisponibilites } from '@/components/calendrier/PanneauIndisponibilites';
import { TimelineJour } from '@/components/calendrier/TimelineJour';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useToutesHorairesOuverture } from '@/hooks/useReglesMetier';
import { useSemaineStore } from '@/store/useSemaineStore';
import { dateEnISO, joursDeLaSemaine, jourSemaineISO, libelleJourCourt } from '@/utils/dateUtils';

type Onglet = 'planning' | 'indisponibilites';

export default function CalendrierScreen() {
  const [onglet, setOnglet] = useState<Onglet>('planning');
  const profile = useProfilEffectif();
  const { dateReference, semaineSuivante, semainePrecedente, revenirAujourdhui } = useSemaineStore();
  const jours = joursDeLaSemaine(dateReference);
  const dateDebut = dateEnISO(jours[0]);
  const dateFin = dateEnISO(jours[6]);

  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: profils, isLoading: chargementProfils } = useActiveProfiles();
  const { data: horaires, isLoading: chargementHoraires } = useToutesHorairesOuverture();
  const { data: shifts, isLoading: chargementShifts } = useShiftsSemaine(dateDebut, dateFin);

  const profilParId = new Map((profils ?? []).map((p) => [p.id, p]));
  const popUpParId = new Map((popUps ?? []).map((p) => [p.id, p]));

  const chargement = chargementPopUps || chargementProfils || chargementHoraires || chargementShifts;

  const horairesActifs = (horaires ?? []).filter((h) => h.actif);
  const heureOuvertureAxe = horairesActifs.length
    ? horairesActifs.reduce((min, h) => (h.heure_ouverture < min ? h.heure_ouverture : min), horairesActifs[0].heure_ouverture)
    : '10:00:00';
  const heureFermetureAxe = horairesActifs.length
    ? horairesActifs.reduce((max, h) => (h.heure_fermeture > max ? h.heure_fermeture : max), horairesActifs[0].heure_fermeture)
    : '20:00:00';

  if (chargement && onglet === 'planning') {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <EnteteMenu titre="Calendrier" />

      <View className="mb-2 flex-row rounded-xl bg-slate-100 p-1 mx-4">
        <Pressable
          onPress={() => setOnglet('planning')}
          className={`flex-1 items-center rounded-lg py-2 ${onglet === 'planning' ? 'bg-white' : ''}`}
        >
          <Text className={onglet === 'planning' ? 'font-semibold text-indigo-600' : 'text-slate-500'}>
            Planning
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('indisponibilites')}
          className={`flex-1 items-center rounded-lg py-2 ${onglet === 'indisponibilites' ? 'bg-white' : ''}`}
        >
          <Text className={onglet === 'indisponibilites' ? 'font-semibold text-indigo-600' : 'text-slate-500'}>
            Mes indisponibilités
          </Text>
        </Pressable>
      </View>

      {onglet === 'indisponibilites' ? (
        <PanneauIndisponibilites />
      ) : (
        <>
          <View className="flex-row items-center justify-between px-4 pb-2">
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

          {popUps && popUps.length > 0 && (
        <View className="mb-2 flex-row flex-wrap gap-x-3 gap-y-1 px-4">
          {popUps.map((p) => (
            <View key={p.id} className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: p.couleur }} />
              <Text className="text-[11px] text-slate-400">{p.nom}</Text>
            </View>
          ))}
          <View className="flex-row items-center gap-1">
            <Text className="text-[11px] text-amber-500">★ = vos créneaux</Text>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
          <AxeHeures heureOuverture={heureOuvertureAxe} heureFermeture={heureFermetureAxe} />

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {jours.map((jour) => {
                const dateIso = dateEnISO(jour);
                const jourIso = jourSemaineISO(jour);
                const reglesJour = (horaires ?? []).filter((h) => h.jour_semaine === jourIso && h.actif);
                const ouvert = reglesJour.length > 0;
                const heureOuverture = ouvert
                  ? reglesJour.reduce((min, h) => (h.heure_ouverture < min ? h.heure_ouverture : min), reglesJour[0].heure_ouverture)
                  : '10:00:00';
                const heureFermeture = ouvert
                  ? reglesJour.reduce((max, h) => (h.heure_fermeture > max ? h.heure_fermeture : max), reglesJour[0].heure_fermeture)
                  : '20:00:00';
                const shiftsJour = (shifts ?? []).filter((s) => s.date === dateIso && s.statut === 'publie');

                return (
                  <TimelineJour
                    key={dateIso}
                    date={jour}
                    heureOuverture={heureOuverture}
                    heureFermeture={heureFermeture}
                    ferme={!ouvert}
                    shifts={shiftsJour}
                    profilParId={profilParId}
                    popUpParId={popUpParId}
                    profileIdActuel={profile?.id}
                  />
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
        </>
      )}
    </View>
  );
}
