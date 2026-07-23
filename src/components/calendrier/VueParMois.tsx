/** @jsxImportSource react */
// Vue web-only "façon Combo" : grille mois, une ligne par employé, une puce compacte par jour
// (nombre de créneaux / premier horaire) — même schéma colonne-noms-fixe + jours-scrollables que
// VueParEmployes.tsx.
import { eachDayOfInterval, endOfMonth, startOfMonth } from 'date-fns';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { JourEcoleAlternant, PlanningShift, PopUp, Profile } from '@/types/database.types';
import { couleurCaseNomSalarie, trierParPopUpAttribue } from '@/utils/affectations';
import { dateEnISO, estAujourdhui, formatHeure, nomJourCourt, numeroJour } from '@/utils/dateUtils';

const LARGEUR_NOM = 180;
const LARGEUR_JOUR_COLONNE = 64;
const HAUTEUR_LIGNE = 44;

// Couleur fixe "à l'école" (alternants), même teinte violette que le badge de VueParEmployes.tsx.
const COULEUR_ECOLE = '#8B5CF6';

export function VueParMois({
  moisReference,
  profils,
  shifts,
  onPressCellule,
  couleurPopUp,
  joursEcole,
  mapAffectations,
  popUps,
}: {
  moisReference: Date;
  profils: Profile[];
  shifts: PlanningShift[];
  onPressCellule: (profil: Profile, dateIso: string, shiftsCellule: PlanningShift[]) => void;
  /** Couleur du pop-up actuellement sélectionné : les puces sont colorées par pop-up (et non plus
   * par employé) — cf. VueParEmployes.tsx. */
  couleurPopUp: string;
  joursEcole: JourEcoleAlternant[];
  /** Sert à colorer la pastille de la colonne des noms avec la couleur du pop-up auquel chaque
   * salarié est attribué (cf. couleurCaseNomSalarie) — cette colonne n'affiche que le nom, sans
   * horaire, contrairement aux puces de la grille (déjà colorées via `couleurPopUp` ci-dessus). */
  mapAffectations: Map<string, Set<string>>;
  popUps: PopUp[];
}) {
  const jours = eachDayOfInterval({ start: startOfMonth(moisReference), end: endOfMonth(moisReference) });
  // Regroupe les gens du même pop-up ensemble (cf. couleur de la colonne des noms) — mêmes deux
  // `.map()` ci-dessous (colonne des noms + lignes de puces) itèrent sur cette liste triée.
  const profilsTries = useMemo(
    () => trierParPopUpAttribue(profils, mapAffectations, popUps),
    [profils, mapAffectations, popUps],
  );

  return (
    <View style={styles.carte}>
      <View style={styles.grille}>
        <View style={styles.colonneNoms}>
          <View style={styles.enteteVide} />
          {profilsTries.map((p) => {
            const couleurPopUpNom = couleurCaseNomSalarie(p, mapAffectations, popUps);
            return (
              <View key={p.id} style={styles.ligneNom}>
                <View
                  style={[
                    styles.pastille,
                    couleurPopUpNom ? { backgroundColor: couleurPopUpNom } : styles.pastilleNeutre,
                  ]}
                />
                <Text style={styles.nomTexte} numberOfLines={1}>
                  {p.nom_complet || p.email}
                </Text>
              </View>
            );
          })}
          {profilsTries.length === 0 && (
            <View style={styles.videLigne}>
              <Text style={styles.videTexte}>Aucun membre pour ce lieu.</Text>
            </View>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
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

            {profilsTries.map((p) => (
              <View key={p.id} style={styles.ligneJours}>
                {jours.map((j) => {
                  const dateIso = dateEnISO(j);
                  const shiftsCellule = shifts.filter((s) => s.profile_id === p.id && s.date === dateIso);
                  const premier = [...shiftsCellule].sort((a, b) => a.heure_debut.localeCompare(b.heure_debut))[0];
                  const aEcole = joursEcole.some((je) => je.profile_id === p.id && je.date === dateIso);
                  return (
                    <Pressable
                      key={dateIso}
                      onPress={() => onPressCellule(p, dateIso, shiftsCellule)}
                      style={styles.cellule}
                    >
                      {/* Puce compacte (44px de haut) : "École" tient sous forme de point plutôt
                          que de texte complet, cf. VueParEmployes.tsx pour la version texte. */}
                      {aEcole && <View style={styles.pointEcole} />}
                      {premier && (
                        <View style={[styles.puce, { backgroundColor: couleurPopUp }]}>
                          <Text style={styles.puceTexte} numberOfLines={1}>
                            {shiftsCellule.length > 1 ? `${shiftsCellule.length}×` : formatHeure(premier.heure_debut)}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
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
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  grille: { flexDirection: 'row' },
  colonneNoms: { width: LARGEUR_NOM, borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  enteteVide: { height: 44, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  ligneNom: {
    height: HAUTEUR_LIGNE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  nomTexte: { fontSize: 12, fontWeight: '600', color: '#1E293B', flexShrink: 1 },
  videLigne: { paddingHorizontal: 14, paddingVertical: 20 },
  videTexte: { fontSize: 13, color: '#94A3B8' },
  pastille: { height: 9, width: 9, borderRadius: 5 },
  // Admin (attribué à tous les lieux, cf. estAttribueA) ou personne sans pop-up attribué : pas de
  // couleur de lieu pertinente, pastille neutre avec juste un contour pour rester visible sur fond
  // blanc (cf. couleurCaseNomSalarie).
  pastilleNeutre: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CBD5E1' },
  enteteJoursRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  enteteJour: {
    width: LARGEUR_JOUR_COLONNE,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
  },
  enteteJourAujourdhui: { backgroundColor: '#EEF2FF' },
  enteteJourLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8' },
  enteteJourNumero: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  ligneJours: { flexDirection: 'row' },
  cellule: {
    width: LARGEUR_JOUR_COLONNE,
    height: HAUTEUR_LIGNE,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  puce: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3, maxWidth: LARGEUR_JOUR_COLONNE - 8 },
  puceTexte: { fontSize: 10, fontWeight: '700', color: 'white' },
  pointEcole: {
    position: 'absolute',
    top: 4,
    right: 4,
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: COULEUR_ECOLE,
  },
});
