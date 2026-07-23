/** @jsxImportSource react */
// Vue web-only "façon Combo" : grille semaine, une ligne par employé (tous lieux confondus, pas de
// filtre préalable), une colonne par jour. La carte remplit toute la hauteur restante de l'écran
// (flex:1, fournie par le parent dans calendrier.tsx) : en-tête des jours fixe en haut, corps
// (colonne des noms + cellules) qui scrolle verticalement en dessous — plutôt que de laisser la
// page entière grandir et scroller. Les colonnes des jours sont en largeur flexible (flex:1
// chacune) pour occuper toute la largeur disponible, sans scroll horizontal.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Conge, JourEcoleAlternant, PlanningShift, PopUp, Profile } from '@/types/database.types';
import { couleurCaseNomSalarie, trierParPopUpAttribue } from '@/utils/affectations';
import { dateEnISO, estAujourdhui, formatHeure, nomJourCourt, numeroJour } from '@/utils/dateUtils';

const LARGEUR_NOM = 180;
const HAUTEUR_LIGNE = 68;

const LIBELLE_CONGE: Record<Conge['type'], string> = {
  conge: 'Congé',
  indisponibilite: 'Indispo.',
};

export function VueParEmployes({
  jours,
  profils,
  shifts,
  popUpParId,
  onPressCellule,
  onPressCelluleConge,
  joursEcole,
  conges,
  mapAffectations,
  popUps,
}: {
  jours: Date[];
  profils: Profile[];
  shifts: PlanningShift[];
  onPressCellule: (profil: Profile, dateIso: string, shiftsCellule: PlanningShift[]) => void;
  /** Cellule couvrant un congé/indisponibilité : on ne peut pas y planifier quelqu'un qui est
   * absent, donc un clic dessus propose plutôt de supprimer ce congé (cf. calendrier.tsx). Si
   * absent, on retombe sur le comportement normal (`onPressCellule`). */
  onPressCelluleConge?: (conge: Conge, profil: Profile) => void;
  /** Couleur par lieu : les créneaux sont colorés par pop-up (cette vue agrège tous les lieux, un
   * employé peut avoir des créneaux à des endroits différents la même semaine). */
  popUpParId: Map<string, PopUp>;
  joursEcole: JourEcoleAlternant[];
  /** Congés/indisponibilités déclarés — affichés en rouge sur la cellule concernée pour qu'on
   * comprenne tout de suite pourquoi la personne n'a pas de créneau ce jour-là. */
  conges: Conge[];
  /** Sert à colorer la pastille de la colonne des noms avec la couleur du pop-up auquel chaque
   * salarié est attribué (cf. couleurCaseNomSalarie) — cette colonne n'affiche que le nom, sans
   * horaire, contrairement aux cellules de la grille (déjà colorées par lieu via popUpParId). */
  mapAffectations: Map<string, Set<string>>;
  popUps: PopUp[];
}) {
  // Regroupe les gens du même pop-up ensemble (cf. couleur de la colonne des noms) plutôt qu'un
  // ordre arbitraire — les deux `.map()` ci-dessous (colonne des noms + cellules) itèrent sur cette
  // même liste triée pour rester synchronisés ligne à ligne.
  const profilsTries = useMemo(
    () => trierParPopUpAttribue(profils, mapAffectations, popUps),
    [profils, mapAffectations, popUps],
  );

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
            {profilsTries.map((p) => {
              const couleurPopUp = couleurCaseNomSalarie(p, mapAffectations, popUps);
              return (
                <View key={p.id} style={styles.ligneNom}>
                  <View
                    style={[
                      styles.pastille,
                      couleurPopUp ? { backgroundColor: couleurPopUp } : styles.pastilleNeutre,
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
                <Text style={styles.videTexte}>Aucun membre.</Text>
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            {profilsTries.map((p) => (
              <View key={p.id} style={styles.ligneJours}>
                {jours.map((j) => {
                  const dateIso = dateEnISO(j);
                  const shiftsCellule = shifts.filter((s) => s.profile_id === p.id && s.date === dateIso);
                  const aEcole = joursEcole.some((je) => je.profile_id === p.id && je.date === dateIso);
                  const congeCellule = conges.find(
                    (c) => c.profile_id === p.id && dateIso >= c.date_debut && dateIso <= c.date_fin,
                  );
                  return (
                    <Pressable
                      key={dateIso}
                      onPress={() =>
                        congeCellule && onPressCelluleConge
                          ? onPressCelluleConge(congeCellule, p)
                          : onPressCellule(p, dateIso, shiftsCellule)
                      }
                      style={[styles.cellule, aEcole && styles.celluleEcole, congeCellule && styles.celluleConge]}
                    >
                      {congeCellule ? (
                        <Text style={styles.texteConge}>{LIBELLE_CONGE[congeCellule.type]}</Text>
                      ) : (
                        aEcole && (
                          <View style={styles.badgeEcole}>
                            <Ionicons name="school-outline" size={11} color="white" />
                            <Text style={styles.badgeEcoleTexte}>École</Text>
                          </View>
                        )
                      )}
                      {/* Une personne en congé ne peut pas aussi travailler ce jour-là : on n'affiche
                       * jamais un créneau empilé sur une cellule congé, même si les données sous-jacentes
                       * (créneau ajouté à la main avant/pendant le congé) ne sont pas encore nettoyées. */}
                      {!congeCellule &&
                        shiftsCellule.map((s) => {
                          const lieu = popUpParId.get(s.pop_up_id);
                          return (
                            <View key={s.id} style={[styles.chip, { backgroundColor: lieu?.couleur ?? '#6366F1' }]}>
                              <Text style={styles.chipEtiquette} numberOfLines={1}>
                                {s.etiquette || lieu?.nom || ''}
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
            ))}
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
    height: HAUTEUR_LIGNE,
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
  // Admin (attribué à tous les lieux, cf. estAttribueA) ou personne sans pop-up attribué : pas de
  // couleur de lieu pertinente, pastille neutre avec juste un contour pour rester visible sur fond
  // blanc (cf. couleurCaseNomSalarie).
  pastilleNeutre: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CBD5E1' },
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
    height: HAUTEUR_LIGNE,
    gap: 4,
    padding: 6,
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  // Journée d'école (alternants) : léger fond violet + badge avec icône, plutôt qu'un aplat gris
  // avec juste du texte — plus soigné, et cohérent avec les chips colorées des shifts à côté.
  celluleEcole: { backgroundColor: '#F5F3FF' },
  badgeEcole: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeEcoleTexte: { fontSize: 11, fontWeight: '700', color: 'white' },
  // Congé/indisponibilité : cellule teintée en rouge (comme École est en gris) avec le type
  // affiché en toutes lettres — prioritaire sur École si les deux coïncident un même jour.
  celluleConge: { backgroundColor: '#FEE2E2' },
  texteConge: { fontSize: 11, fontWeight: '700', color: '#DC2626', textAlign: 'center' },
  chip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipEtiquette: { fontSize: 10, fontWeight: '700', color: 'white' },
  chipHoraire: { fontSize: 10, color: 'rgba(255,255,255,0.9)' },
});
