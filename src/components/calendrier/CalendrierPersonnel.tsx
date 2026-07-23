/** @jsxImportSource react */
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { AxeHeures } from './AxeHeures';
import { TimelineJour } from './TimelineJour';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useToutesHorairesOuverture } from '@/hooks/useReglesMetier';
import { useSemaineStore } from '@/store/useSemaineStore';
import type { Profile } from '@/types/database.types';
import { dateEnISO, formatDureeHeures, joursDeLaSemaine, jourSemaineISO, totalHeuresTravaillees } from '@/utils/dateUtils';

/** Semaine du planning d'une seule personne, tous lieux confondus, colorée par lieu (cf.
 * TimelineJour) : utilisé à la fois comme écran "Calendrier" des non-admins et comme option
 * "Mon calendrier" du Calendrier admin. */
export function CalendrierPersonnel({ profile }: { profile: Profile | null }) {
  const { dateReference } = useSemaineStore();
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

  if (chargement) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  const totalHeures = profile ? totalHeuresTravaillees(shifts ?? [], profile.id) : 0;
  const depassement = !!profile?.heures_max_semaine && totalHeures > profile.heures_max_semaine;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
      {profile && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: depassement ? '#DC2626' : '#64748B' }}>
            {formatDureeHeures(totalHeures)} cette semaine
            {profile.heures_max_semaine ? ` / ${formatDureeHeures(profile.heures_max_semaine)} max` : ''}
          </Text>
        </View>
      )}
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
              const shiftsJour = (shifts ?? []).filter((s) => s.date === dateIso && s.profile_id === profile?.id);

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
  );
}
