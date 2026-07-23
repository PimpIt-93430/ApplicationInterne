/** @jsxImportSource react */
// Vue web-only "façon Combo" : un seul jour à la fois (sélecteur de jour dans la semaine
// affichée), en-tête "Effectifs par 30mn/1h" (comptage client à partir des shifts déjà chargés),
// puis la timeline horaire du jour — réutilise TimelineJour.tsx tel quel (non modifié), comme une
// colonne unique au lieu des 7 de la vue semaine native.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { JourEcoleAlternant, PlanningShift, PopUp, Profile } from '@/types/database.types';
import { dateEnISO, estAujourdhui, nomJourCourt, numeroJour } from '@/utils/dateUtils';
import { versMinutes } from '@/utils/timelineLayout';
import { AxeHeures } from './AxeHeures';
import { TimelineJour } from './TimelineJour';

type Intervalle = 30 | 60;

// Couleur fixe "à l'école" (alternants), identique à celle utilisée dans VueParEmployes.tsx /
// VueParMois.tsx.
const COULEUR_ECOLE = '#94A3B8';

export function VueParJour({
  jours,
  jourSelectionneIso,
  onSelectJour,
  date,
  heureOuverture,
  heureFermeture,
  ferme,
  shifts,
  profilParId,
  onPressBloc,
  onPressTimeline,
  popUpActuel,
  joursEcole,
}: {
  jours: Date[];
  jourSelectionneIso: string;
  onSelectJour: (dateIso: string) => void;
  date: Date;
  heureOuverture: string;
  heureFermeture: string;
  ferme: boolean;
  shifts: PlanningShift[];
  profilParId: Map<string, Profile>;
  onPressBloc: (shift: PlanningShift) => void;
  onPressTimeline: (minutesDepuisOuverture: number) => void;
  /** Pop-up actuellement sélectionné : sert à colorer les blocs de la timeline par pop-up (via
   * TimelineJour.popUpParId) au lieu de la couleur par employé, cf. VueParEmployes.tsx. */
  popUpActuel: PopUp | undefined;
  joursEcole: JourEcoleAlternant[];
}) {
  const [intervalle, setIntervalle] = useState<Intervalle>(30);

  const popUpParId = useMemo(
    () => (popUpActuel ? new Map([[popUpActuel.id, popUpActuel]]) : undefined),
    [popUpActuel],
  );

  // Alternants ayant école ce jour-là (nom affiché ci-dessus de la timeline) : TimelineJour n'est
  // pas modifié et ne connaît pas la notion d'école, cf. consigne.
  const alternantsEcoleJour = joursEcole
    .filter((j) => j.date === jourSelectionneIso)
    .map((j) => profilParId.get(j.profile_id))
    .filter((p): p is Profile => !!p);

  const heureDebutMin = versMinutes(heureOuverture);
  const heureFinMin = versMinutes(heureFermeture);
  const creneauxEffectifs: { minutes: number; label: string; effectif: number }[] = [];
  for (let m = heureDebutMin; m < heureFinMin; m += intervalle) {
    const effectif = shifts.filter((s) => versMinutes(s.heure_debut) <= m && versMinutes(s.heure_fin) > m).length;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    creneauxEffectifs.push({ minutes: m, label: `${String(h).padStart(2, '0')}h${mm ? String(mm).padStart(2, '0') : ''}`, effectif });
  }

  return (
    <View style={styles.carte}>
      <View style={styles.selecteurJourRow}>
        {jours.map((j) => {
          const dateIso = dateEnISO(j);
          const actif = dateIso === jourSelectionneIso;
          return (
            <Pressable
              key={dateIso}
              onPress={() => onSelectJour(dateIso)}
              style={[styles.jourPill, actif && styles.jourPillActif, estAujourdhui(j) && !actif && styles.jourPillAujourdhui]}
            >
              <Text style={[styles.jourPillLabel, actif && styles.jourPillLabelActif]}>{nomJourCourt(j)}</Text>
              <Text style={[styles.jourPillNumero, actif && styles.jourPillNumeroActif]}>{numeroJour(j)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.enteteEffectifs}>
        <Text style={styles.titreEffectifs}>Effectifs par</Text>
        <View style={styles.segmentIntervalle}>
          <Pressable
            onPress={() => setIntervalle(30)}
            style={[styles.segmentBoutonMini, intervalle === 30 && styles.segmentBoutonMiniActif]}
          >
            <Text style={intervalle === 30 ? styles.segmentMiniTexteActif : styles.segmentMiniTexte}>30mn</Text>
          </Pressable>
          <Pressable
            onPress={() => setIntervalle(60)}
            style={[styles.segmentBoutonMini, intervalle === 60 && styles.segmentBoutonMiniActif]}
          >
            <Text style={intervalle === 60 ? styles.segmentMiniTexteActif : styles.segmentMiniTexte}>1h</Text>
          </Pressable>
        </View>
      </View>

      {!ferme && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.effectifsScroll}>
          <View style={{ flexDirection: 'row' }}>
            {creneauxEffectifs.map((c) => (
              <View key={c.minutes} style={styles.effectifCellule}>
                <Text style={styles.effectifHeure}>{c.label}</Text>
                <Text style={[styles.effectifNombre, c.effectif === 0 && styles.effectifNombreVide]}>{c.effectif}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {alternantsEcoleJour.length > 0 && (
        <View style={styles.ecoleRow}>
          {alternantsEcoleJour.map((p) => (
            <View key={p.id} style={styles.chipEcole}>
              <Text style={styles.chipEcoleTexte} numberOfLines={1}>
                École · {p.nom_complet || p.email}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.timelineRow}>
        <AxeHeures heureOuverture={heureOuverture} heureFermeture={heureFermeture} />
        <TimelineJour
          date={date}
          heureOuverture={heureOuverture}
          heureFermeture={heureFermeture}
          ferme={ferme}
          shifts={shifts}
          profilParId={profilParId}
          popUpParId={popUpParId}
          modifiable={false}
          onPressBloc={onPressBloc}
          onPressTimeline={onPressTimeline}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    marginHorizontal: 20,
    marginBottom: 16,
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
  selecteurJourRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  jourPill: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 52,
  },
  jourPillAujourdhui: { borderColor: '#C7D2FE' },
  jourPillActif: { borderColor: '#4F46E5', backgroundColor: '#4F46E5' },
  jourPillLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8' },
  jourPillLabelActif: { color: 'rgba(255,255,255,0.85)' },
  jourPillNumero: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  jourPillNumeroActif: { color: 'white' },
  enteteEffectifs: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  titreEffectifs: { fontSize: 13, fontWeight: '600', color: '#475569' },
  segmentIntervalle: { flexDirection: 'row', borderRadius: 999, backgroundColor: '#F1F5F9', padding: 2 },
  segmentBoutonMini: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  segmentBoutonMiniActif: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentMiniTexte: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  segmentMiniTexteActif: { fontSize: 11, fontWeight: '600', color: '#4F46E5' },
  effectifsScroll: { marginBottom: 12, marginLeft: 40 },
  effectifCellule: { width: 44, alignItems: 'center' },
  effectifHeure: { fontSize: 9, color: '#CBD5E1' },
  effectifNombre: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  effectifNombreVide: { color: '#CBD5E1' },
  ecoleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12, marginLeft: 40 },
  chipEcole: { borderRadius: 999, backgroundColor: COULEUR_ECOLE, paddingHorizontal: 10, paddingVertical: 4 },
  chipEcoleTexte: { fontSize: 11, fontWeight: '700', color: 'white' },
  timelineRow: { flexDirection: 'row' },
});
