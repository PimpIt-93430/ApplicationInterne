/** @jsxImportSource react */
// Vue web-only "façon Combo" : grille semaine, une ligne par pop-up (tous lieux confondus, pas de
// filtre préalable), une colonne par jour. Même schéma que VueParEmployes.tsx : carte flex:1 qui
// remplit l'écran restant, en-tête des jours fixe, corps scrollable verticalement, colonnes de
// jours en largeur flexible. Chaque ligne a une hauteur CALCULÉE (pas fixe) en fonction du nombre
// maximum de créneaux empilés dans une cellule de cette ligne, pour que tous les employés d'un
// pop-up très chargé restent lisibles au lieu d'être coupés dans une case trop petite.
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import type { PlanningShift, PopUp, Profile } from '@/types/database.types';
import { dateEnISO, estAujourdhui, formatHeure, nomJourCourt, numeroJour } from '@/utils/dateUtils';

const LARGEUR_NOM = 180;
const HAUTEUR_MIN_LIGNE = 68;
const HAUTEUR_CHIP = 38;
const ESPACE_CHIP = 4;
const PADDING_CELLULE = 12;

export function VueParPopUps({
  jours,
  popUps,
  shifts,
  profilParId,
  onPressCellule,
}: {
  jours: Date[];
  popUps: PopUp[];
  shifts: PlanningShift[];
  profilParId: Map<string, Profile>;
  onPressCellule: (popUp: PopUp, dateIso: string, shiftsCellule: PlanningShift[]) => void;
}) {
  return (
    <View style={styles.carte}>
      <View style={styles.enteteRow}>
        <View style={[styles.colonneNomLargeur, styles.enteteVide]} />
        <View style={styles.enteteJoursRow}>
          {jours.map((j) => (
            <View
              key={dateEnISO(j)}
              style={[styles.enteteJour, estAujourdhui(j) && styles.enteteJourAujourdhui]}
            >
              <Text style={styles.enteteJourLabel}>{nomJourCourt(j)}</Text>
              <Text style={styles.enteteJourNumero}>{numeroJour(j)}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.corps}>
          <View style={styles.colonneNoms}>
            {popUps.map((p) => {
              const maxParJour = Math.max(
                0,
                ...jours.map((j) => shifts.filter((s) => s.pop_up_id === p.id && s.date === dateEnISO(j)).length),
              );
              const hauteur = Math.max(
                HAUTEUR_MIN_LIGNE,
                PADDING_CELLULE + maxParJour * HAUTEUR_CHIP + Math.max(0, maxParJour - 1) * ESPACE_CHIP,
              );
              return (
                <View key={p.id} style={[styles.ligneNom, { height: hauteur }]}>
                  <View style={[styles.pastille, { backgroundColor: p.couleur }]} />
                  <Text style={styles.nomTexte} numberOfLines={1}>
                    {p.nom}
                  </Text>
                </View>
              );
            })}
            {popUps.length === 0 && (
              <View style={styles.videLigne}>
                <Text style={styles.videTexte}>Aucun pop-up.</Text>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            {popUps.map((popUp) => {
              const maxParJour = Math.max(
                0,
                ...jours.map((j) => shifts.filter((s) => s.pop_up_id === popUp.id && s.date === dateEnISO(j)).length),
              );
              const hauteur = Math.max(
                HAUTEUR_MIN_LIGNE,
                PADDING_CELLULE + maxParJour * HAUTEUR_CHIP + Math.max(0, maxParJour - 1) * ESPACE_CHIP,
              );
              return (
                <View key={popUp.id} style={styles.ligneJours}>
                  {jours.map((j) => {
                    const dateIso = dateEnISO(j);
                    const shiftsCellule = shifts.filter((s) => s.pop_up_id === popUp.id && s.date === dateIso);
                    return (
                      <Pressable
                        key={dateIso}
                        onPress={() => onPressCellule(popUp, dateIso, shiftsCellule)}
                        style={[styles.cellule, { height: hauteur }]}
                      >
                        {shiftsCellule.map((s) => {
                          const employe = profilParId.get(s.profile_id);
                          return (
                            <View
                              key={s.id}
                              style={[styles.chip, { backgroundColor: employe?.couleur ?? '#6366F1' }]}
                            >
                              <Text style={styles.chipNom} numberOfLines={1}>
                                {employe?.nom_complet || employe?.email || '—'}
                              </Text>
                              <Text style={styles.chipHoraire}>
                                {formatHeure(s.heure_debut)}-{formatHeure(s.heure_fin)}
                              </Text>
                            </View>
                          );
                        })}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  colonneNomLargeur: { width: LARGEUR_NOM },
  enteteRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  corps: { flexDirection: 'row', flex: 1 },
  colonneNoms: { width: LARGEUR_NOM, borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  enteteVide: { height: 48, borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  ligneNom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  nomTexte: { fontSize: 13, fontWeight: '600', color: '#1E293B', flexShrink: 1 },
  videLigne: { paddingHorizontal: 14, paddingVertical: 20 },
  videTexte: { fontSize: 13, color: '#94A3B8' },
  pastille: { height: 10, width: 10, borderRadius: 5 },
  enteteJoursRow: { flex: 1, flexDirection: 'row' },
  enteteJour: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
  },
  enteteJourAujourdhui: { backgroundColor: '#EEF2FF' },
  enteteJourLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8' },
  enteteJourNumero: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  ligneJours: { flexDirection: 'row' },
  cellule: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    padding: 6,
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  chipNom: { fontSize: 11, fontWeight: '700', color: 'white' },
  chipHoraire: { fontSize: 10, color: 'rgba(255,255,255,0.9)' },
});
