/** @jsxImportSource react */
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import type { PlanningShift, PopUp, Profile } from '@/types/database.types';
import { estAujourdhui, formatHeure, nomJourCourt, numeroJour } from '@/utils/dateUtils';
import { minutesDepuis, positionnerChevauchements, versMinutes } from '@/utils/timelineLayout';
import { HAUTEUR_ENTETE, LARGEUR_JOUR, PX_PAR_HEURE } from './timelineConstants';

const DUREE_MIN_MINUTES = 15;

interface GroupeCreneau {
  cle: string;
  heure_debut: string;
  heure_fin: string;
  shifts: PlanningShift[];
}

/** Regroupe les créneaux ayant exactement les mêmes heures (ex. 3 personnes au local de 10h à
 * 19h) dans une seule colonne au lieu d'une par personne — sinon, sur un jour chargé, les
 * colonnes deviennent trop étroites pour lire les noms. Deux créneaux à des heures différentes,
 * même s'ils se chevauchent partiellement, restent dans des colonnes séparées comme avant. */
function regrouperParHoraire(shifts: PlanningShift[]): GroupeCreneau[] {
  const groupes = new Map<string, GroupeCreneau>();
  for (const shift of shifts) {
    const cle = `${shift.heure_debut}-${shift.heure_fin}`;
    const groupe = groupes.get(cle);
    if (groupe) groupe.shifts.push(shift);
    else groupes.set(cle, { cle, heure_debut: shift.heure_debut, heure_fin: shift.heure_fin, shifts: [shift] });
  }
  return [...groupes.values()];
}

type BordRedimensionne = 'debut' | 'fin';

function BlocCreneau({
  groupe,
  top,
  hauteur,
  left,
  largeur,
  backgroundColor,
  estGroupe,
  estMoi,
  popUp,
  profilParId,
  profileIdActuel,
  heureOuverture,
  heureFermeture,
  modifiable,
  onPress,
  onShiftMoved,
  onShiftResized,
}: {
  groupe: GroupeCreneau;
  top: number;
  hauteur: number;
  left: number;
  largeur: number;
  backgroundColor: string;
  estGroupe: boolean;
  estMoi: boolean;
  popUp?: PopUp;
  profilParId: Map<string, Profile>;
  profileIdActuel?: string;
  heureOuverture: string;
  heureFermeture: string;
  modifiable: boolean;
  onPress?: () => void;
  onShiftMoved?: (shifts: PlanningShift[], deltaMinutes: number) => Promise<boolean>;
  onShiftResized?: (shifts: PlanningShift[], bord: BordRedimensionne, nouvelleMinutes: number) => Promise<boolean>;
}) {
  const debutOffsetMin = useSharedValue(0);
  const finOffsetMin = useSharedValue(0);

  const contenu = (
    <>
      {groupe.shifts.map((s) => {
        const profil = profilParId.get(s.profile_id);
        const cestMoi = !!profileIdActuel && s.profile_id === profileIdActuel;
        return (
          <Text key={s.id} style={styles.blocNom} numberOfLines={1}>
            {cestMoi ? '★ ' : ''}
            {profil?.nom_complet || profil?.email || '?'}
          </Text>
        );
      })}
      <Text style={styles.blocHeure} numberOfLines={1}>
        {formatHeure(groupe.heure_debut)}-{formatHeure(groupe.heure_fin)}
      </Text>
      {!estGroupe && popUp && (
        <Text style={styles.blocPopUp} numberOfLines={1}>
          {popUp.nom}
        </Text>
      )}
    </>
  );

  if (!modifiable) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.bloc, { top, height: hauteur, left, width: largeur, backgroundColor }, estMoi && styles.blocMoi]}
      >
        {contenu}
      </Pressable>
    );
  }

  const debutMin = versMinutes(groupe.heure_debut);
  const finMin = versMinutes(groupe.heure_fin);
  const heureOuvertureMin = versMinutes(heureOuverture);
  const heureFermetureMin = versMinutes(heureFermeture);

  const remettreEnPlace = () => {
    debutOffsetMin.value = withSpring(0);
    finOffsetMin.value = withSpring(0);
  };

  const gererFinDeplacement = (deltaMinutes: number) => {
    if (deltaMinutes === 0 || !onShiftMoved) {
      remettreEnPlace();
      return;
    }
    onShiftMoved(groupe.shifts, deltaMinutes).then((ok) => {
      if (ok) {
        debutOffsetMin.value = 0;
        finOffsetMin.value = 0;
      } else {
        remettreEnPlace();
      }
    });
  };

  const gererFinRedimensionnement = (bord: BordRedimensionne, nouvelleMinutes: number) => {
    if (!onShiftResized) {
      remettreEnPlace();
      return;
    }
    onShiftResized(groupe.shifts, bord, nouvelleMinutes).then((ok) => {
      if (ok) {
        debutOffsetMin.value = 0;
        finOffsetMin.value = 0;
      } else {
        remettreEnPlace();
      }
    });
  };

  const panDeplacer = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      const brut = Math.round(((e.translationY / PX_PAR_HEURE) * 60) / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
      const min = heureOuvertureMin - debutMin;
      const max = heureFermetureMin - finMin;
      const snap = Math.max(min, Math.min(brut, max));
      debutOffsetMin.value = snap;
      finOffsetMin.value = snap;
    })
    .onEnd(() => {
      runOnJS(gererFinDeplacement)(debutOffsetMin.value);
    });

  const panRedimensionnerHaut = Gesture.Pan().onUpdate((e) => {
    const brut = Math.round(((e.translationY / PX_PAR_HEURE) * 60) / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
    const min = heureOuvertureMin - debutMin;
    const max = finMin - DUREE_MIN_MINUTES - debutMin;
    debutOffsetMin.value = Math.max(min, Math.min(brut, max));
  }).onEnd(() => {
    runOnJS(gererFinRedimensionnement)('debut', debutMin + debutOffsetMin.value);
  });

  const panRedimensionnerBas = Gesture.Pan().onUpdate((e) => {
    const brut = Math.round(((e.translationY / PX_PAR_HEURE) * 60) / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
    const min = debutMin + DUREE_MIN_MINUTES - finMin;
    const max = heureFermetureMin - finMin;
    finOffsetMin.value = Math.max(min, Math.min(brut, max));
  }).onEnd(() => {
    runOnJS(gererFinRedimensionnement)('fin', finMin + finOffsetMin.value);
  });

  const tapGesture = Gesture.Tap().onEnd((_e, success) => {
    if (success && onPress) runOnJS(onPress)();
  });

  const gesteCorps = Gesture.Exclusive(panDeplacer, tapGesture);

  const styleAnime = useAnimatedStyle(() => ({
    top: top + (debutOffsetMin.value / 60) * PX_PAR_HEURE,
    height: Math.max(hauteur + ((finOffsetMin.value - debutOffsetMin.value) / 60) * PX_PAR_HEURE, 20),
  }));

  return (
    <GestureDetector gesture={gesteCorps}>
      <Animated.View
        style={[styles.bloc, { left, width: largeur, backgroundColor }, estMoi && styles.blocMoi, styleAnime]}
      >
        {contenu}
        <GestureDetector gesture={panRedimensionnerHaut}>
          <View style={styles.poigneeHaut} />
        </GestureDetector>
        <GestureDetector gesture={panRedimensionnerBas}>
          <View style={styles.poigneeBas} />
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}

export function TimelineJour({
  date,
  heureOuverture,
  heureFermeture,
  ferme,
  shifts,
  profilParId,
  popUpParId,
  profileIdActuel,
  modifiable = false,
  onPressBloc,
  onPressTimeline,
  onShiftMoved,
  onShiftResized,
}: {
  date: Date;
  heureOuverture: string;
  heureFermeture: string;
  ferme: boolean;
  shifts: PlanningShift[];
  profilParId: Map<string, Profile>;
  popUpParId?: Map<string, PopUp>;
  profileIdActuel?: string;
  modifiable?: boolean;
  onPressBloc?: (shift: PlanningShift) => void;
  onPressTimeline?: (minutesDepuisOuverture: number) => void;
  onShiftMoved?: (shifts: PlanningShift[], deltaMinutes: number) => Promise<boolean>;
  onShiftResized?: (shifts: PlanningShift[], bord: BordRedimensionne, nouvelleMinutes: number) => Promise<boolean>;
}) {
  const heureDebutAxe = Number(heureOuverture.split(':')[0]);
  const heureFinAxe = Number(heureFermeture.split(':')[0]);
  const hauteurTimeline = (heureFinAxe - heureDebutAxe) * PX_PAR_HEURE;

  const positions = positionnerChevauchements(regrouperParHoraire(shifts));
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

          {positions.map(({ item: groupe, colIndex, colCount }) => {
            const premier = groupe.shifts[0];
            const profilPremier = profilParId.get(premier.profile_id);
            const popUp = popUpParId?.get(premier.pop_up_id);
            const estGroupe = groupe.shifts.length > 1;
            const estMoi = !!profileIdActuel && groupe.shifts.some((s) => s.profile_id === profileIdActuel);
            const top = (minutesDepuis(heureOuverture, groupe.heure_debut) / 60) * PX_PAR_HEURE;
            const hauteurBrute = (minutesDepuis(groupe.heure_debut, groupe.heure_fin) / 60) * PX_PAR_HEURE;
            const hauteur = Math.max(hauteurBrute, 20 + (groupe.shifts.length - 1) * 13);
            const largeur = (LARGEUR_JOUR - 4) / colCount;

            return (
              <BlocCreneau
                key={groupe.cle}
                groupe={groupe}
                top={top}
                hauteur={hauteur}
                left={2 + colIndex * largeur}
                largeur={largeur - 2}
                // Calendrier perso (popUpParId fourni) : une seule personne, donc sa couleur à
                // elle n'apprend rien — on colore plutôt par lieu (Local, Créteil, Soleil...) pour
                // voir en un coup d'œil où on travaille. Vue équipe par lieu (admin) : tout le
                // monde est déjà au même endroit, donc on garde la couleur par personne.
                backgroundColor={popUpParId ? (popUp?.couleur ?? '#6366F1') : estGroupe ? '#475569' : (profilPremier?.couleur ?? '#6366F1')}
                estGroupe={estGroupe}
                estMoi={estMoi}
                popUp={popUp}
                profilParId={profilParId}
                profileIdActuel={profileIdActuel}
                heureOuverture={heureOuverture}
                heureFermeture={heureFermeture}
                modifiable={modifiable}
                onPress={gererPressBloc ? () => gererPressBloc(premier) : undefined}
                onShiftMoved={onShiftMoved}
                onShiftResized={onShiftResized}
              />
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
  poigneeHaut: { position: 'absolute', top: 0, left: 0, right: 0, height: 10 },
  poigneeBas: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 10 },
});
