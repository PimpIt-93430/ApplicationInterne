/** @jsxImportSource react */
// Web uniquement : version "carte" (façon VueParJour/VueParEmployes) de l'écran Calendrier pour
// une personne sans aucun droit calendrier (cf. calendrier.web.tsx) ou un admin en vue alternant
// dont la personne prévisualisée n'a pas ce droit. CalendrierPersonnelEcran/CalendrierPersonnel
// (mobile, réutilisés aussi par admin/calendrier.tsx) ne sont pas modifiés : ils reposent sur des
// classes NativeWind pensées pour un écran de téléphone (marges de 16px, onglets plats, pas de
// carte) qui, une fois étirées sur un écran large, rendent l'écran nu et non fini. Ici : mêmes
// données (CalendrierPersonnel), mais habillage web StyleSheet cohérent avec le reste du
// calendrier desktop — carte blanche à bord arrondi/ombre, onglets segmentés, badge d'heures.
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AxeHeures } from './AxeHeures';
import { PanneauIndisponibilites } from './PanneauIndisponibilites';
import { TimelineJour } from './TimelineJour';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { useShiftsSemaine } from '@/hooks/usePlanning';
import { usePopUps } from '@/hooks/usePopUps';
import { useActiveProfiles } from '@/hooks/useProfiles';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useToutesHorairesOuverture } from '@/hooks/useReglesMetier';
import { useSemaineStore } from '@/store/useSemaineStore';
import {
  dateEnISO,
  formatDureeHeures,
  joursDeLaSemaine,
  jourSemaineISO,
  libellePeriodeCourte,
  totalHeuresTravaillees,
} from '@/utils/dateUtils';

type Onglet = 'planning' | 'indisponibilites';

export function CalendrierPersonnelEcranWeb() {
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

  const chargement = chargementPopUps || chargementProfils || chargementHoraires || chargementShifts;

  const profilParId = new Map((profils ?? []).map((p) => [p.id, p]));
  const popUpParId = new Map((popUps ?? []).map((p) => [p.id, p]));

  const horairesActifs = (horaires ?? []).filter((h) => h.actif);
  const heureOuvertureAxe = horairesActifs.length
    ? horairesActifs.reduce((min, h) => (h.heure_ouverture < min ? h.heure_ouverture : min), horairesActifs[0].heure_ouverture)
    : '10:00:00';
  const heureFermetureAxe = horairesActifs.length
    ? horairesActifs.reduce((max, h) => (h.heure_fermeture > max ? h.heure_fermeture : max), horairesActifs[0].heure_fermeture)
    : '20:00:00';

  const totalHeures = profile ? totalHeuresTravaillees(shifts ?? [], profile.id) : 0;
  const depassement = !!profile?.heures_max_semaine && totalHeures > profile.heures_max_semaine;

  return (
    <View style={styles.ecran}>
      <EnteteMenu titre="Calendrier" />

      <View style={styles.segment}>
        <Pressable
          onPress={() => setOnglet('planning')}
          style={[styles.segmentBouton, onglet === 'planning' && styles.segmentBoutonActif]}
        >
          <Text style={onglet === 'planning' ? styles.segmentTexteActif : styles.segmentTexte}>Planning</Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('indisponibilites')}
          style={[styles.segmentBouton, onglet === 'indisponibilites' && styles.segmentBoutonActif]}
        >
          <Text style={onglet === 'indisponibilites' ? styles.segmentTexteActif : styles.segmentTexte}>
            Mes indisponibilités
          </Text>
        </Pressable>
      </View>

      {onglet === 'indisponibilites' ? (
        <PanneauIndisponibilites />
      ) : chargement ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : (
        <View style={styles.carte}>
          <View style={styles.enteteCarte}>
            <View style={styles.navPair}>
              <Pressable onPress={semainePrecedente} style={styles.navBouton}>
                <Text style={styles.navFleche}>‹</Text>
              </Pressable>
              <Pressable onPress={revenirAujourdhui}>
                <Text style={styles.navTexte}>{libellePeriodeCourte(jours[0], jours[6])}</Text>
              </Pressable>
              <Pressable onPress={semaineSuivante} style={styles.navBouton}>
                <Text style={styles.navFleche}>›</Text>
              </Pressable>
            </View>

            {profile && (
              <View style={[styles.badgeHeures, depassement && styles.badgeHeuresDepassement]}>
                <Text style={[styles.badgeHeuresTexte, depassement && styles.badgeHeuresTexteDepassement]}>
                  {formatDureeHeures(totalHeures)} cette semaine
                  {profile.heures_max_semaine ? ` / ${formatDureeHeures(profile.heures_max_semaine)} max` : ''}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.timelineRow}>
            <AxeHeures heureOuverture={heureOuvertureAxe} heureFermeture={heureFermetureAxe} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.joursRow}>
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segment: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
    flexDirection: 'row',
    gap: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    padding: 4,
  },
  segmentBouton: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 8 },
  segmentBoutonActif: { backgroundColor: 'white' },
  segmentTexte: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  segmentTexteActif: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  carte: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginBottom: 16,
    maxWidth: '100%',
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  enteteCarte: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 16,
  },
  navPair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBouton: { paddingHorizontal: 8, paddingVertical: 4 },
  navFleche: { fontSize: 18, color: '#4F46E5' },
  navTexte: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  badgeHeures: { borderRadius: 999, backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6 },
  badgeHeuresDepassement: { backgroundColor: '#FEE2E2' },
  badgeHeuresTexte: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  badgeHeuresTexteDepassement: { color: '#DC2626' },
  timelineRow: { flexDirection: 'row' },
  joursRow: { flexDirection: 'row', gap: 8 },
});
