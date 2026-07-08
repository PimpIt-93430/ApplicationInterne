/** @jsxImportSource react */
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import type { PlanningShift, PopUp, Profile } from '@/types/database.types';
import { estAujourdhui, formatHeure, nomJourCourt, numeroJour } from '@/utils/dateUtils';
import { minutesDepuis, positionnerChevauchements } from '@/utils/timelineLayout';
import { HAUTEUR_ENTETE, LARGEUR_JOUR, PX_PAR_HEURE } from './timelineConstants';

export function TimelineJour({
  date,
  heureOuverture,
  heureFermeture,
  ferme,
  shifts,
  profilParId,
  popUpParId,
  profileIdActuel,
  onPressBloc,
  onPressTimeline,
}: {
  date: Date;
  heureOuverture: string;
  heureFermeture: string;
  ferme: boolean;
  shifts: PlanningShift[];
  profilParId: Map<string, Profile>;
  popUpParId?: Map<string, PopUp>;
  profileIdActuel?: string;
  onPressBloc?: (shift: PlanningShift) => void;
  onPressTimeline?: (minutesDepuisOuverture: number) => void;
}) {
  const heureDebutAxe = Number(heureOuverture.split(':')[0]);
  const heureFinAxe = Number(heureFermeture.split(':')[0]);
  const hauteurTimeline = (heureFinAxe - heureDebutAxe) * PX_PAR_HEURE;

  const positions = positionnerChevauchements(shifts);
  const gererPressBloc = onPressBloc;

  const handlePressTimeline = (e: GestureResponderEvent) => {
    if (!onPressTimeline) return;
    const y = e.nativeEvent.locationY;
    onPressTimeline((y / PX_PAR_HEURE) * 60);
  };

  return (
    <View style={{ width: LARGEUR_JOUR }}>
      <View style={[styles.entete, estAujourdhui(date) && styles.enteteAujourdhui]}>
        <Text style={styles.enteteJour}>{nomJourCourt(date)}</Text>
        <Text style={styles.enteteNumero}>{numeroJour(date)}</Text>
      </View>

      {ferme ? (
        <View style={[styles.timeline, { height: 60 }]}>
          <Text style={styles.texteFerme}>Fermé</Text>
        </View>
      ) : (
        <Pressable onPress={onPressTimeline ? handlePressTimeline : undefined} style={[styles.timeline, { height: hauteurTimeline }]}>
          {Array.from({ length: heureFinAxe - heureDebutAxe + 1 }, (_, i) => i).map((i) => (
            <View key={i} style={[styles.ligneHeure, { top: i * PX_PAR_HEURE }]} />
          ))}

          {positions.map(({ item, colIndex, colCount }) => {
            const profil = profilParId.get(item.profile_id);
            const popUp = popUpParId?.get(item.pop_up_id);
            const estMoi = !!profileIdActuel && item.profile_id === profileIdActuel;
            const top = (minutesDepuis(heureOuverture, item.heure_debut) / 60) * PX_PAR_HEURE;
            const hauteur = (minutesDepuis(item.heure_debut, item.heure_fin) / 60) * PX_PAR_HEURE;
            const largeur = (LARGEUR_JOUR - 4) / colCount;

            return (
              <Pressable
                key={item.id}
                onPress={gererPressBloc ? () => gererPressBloc(item) : undefined}
                style={[
                  styles.bloc,
                  {
                    top,
                    height: Math.max(hauteur, 20),
                    left: 2 + colIndex * largeur,
                    width: largeur - 2,
                    backgroundColor: profil?.couleur ?? '#6366F1',
                    opacity: item.statut === 'publie' ? 1 : 0.65,
                    borderStyle: item.statut === 'publie' ? 'solid' : 'dashed',
                  },
                  estMoi && styles.blocMoi,
                ]}
              >
                <Text style={styles.blocNom} numberOfLines={1}>
                  {estMoi ? '★ ' : ''}
                  {profil?.nom_complet || profil?.email || '?'}
                </Text>
                <Text style={styles.blocHeure} numberOfLines={1}>
                  {formatHeure(item.heure_debut)}-{formatHeure(item.heure_fin)}
                </Text>
                {popUp && (
                  <Text style={styles.blocPopUp} numberOfLines={1}>
                    {popUp.nom}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entete: { height: HAUTEUR_ENTETE, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  enteteAujourdhui: { backgroundColor: '#EEF2FF' },
  enteteJour: { fontSize: 10, fontWeight: '600', color: '#94A3B8' },
  enteteNumero: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  timeline: {
    position: 'relative',
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  texteFerme: { padding: 10, textAlign: 'center', fontSize: 12, color: '#94A3B8' },
  ligneHeure: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#EEF1F5' },
  bloc: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  blocMoi: { borderWidth: 3, borderColor: '#FBBF24' },
  blocNom: { fontSize: 11, fontWeight: '700', color: 'white' },
  blocHeure: { fontSize: 9, color: 'rgba(255,255,255,0.85)' },
  blocPopUp: { fontSize: 9, color: 'rgba(255,255,255,0.85)' },
});
