/** @jsxImportSource react */
// Composant en StyleSheet (pas de className) : même contrainte que PanneauDemandesConge.tsx,
// évite le bug NativeWind rencontré avec le sélecteur natif (ici un sélecteur d'heure).
import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { insererShifts, supprimerShift } from '@/api/planning';
import type { Conge, PlanningShift, Profile } from '@/types/database.types';
import { formatCreneauShift } from '@/utils/dateUtils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ModePicker = 'debut' | 'fin' | 'pauseDebut' | 'pauseFin' | null;

function formatDateAffichee(dateIso: string): string {
  const txt = new Date(`${dateIso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function heureVersDate(heure: string): Date {
  const [h, m] = heure.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date;
}

function dateVersHeure(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function seChevauchent(aDebut: string, aFin: string, bDebut: string, bFin: string): boolean {
  return aDebut < bFin && bDebut < aFin;
}

/** Feuille mobile "Ajouter/supprimer un créneau" ouverte au clic d'une cellule (personne × jour)
 * de la grille équipe (cf. VueParEmployes réutilisée en mode compact dans PlanningMobile). Le
 * pop-up de destination est déjà connu (l'équipe affichée est scopée à un seul lieu), donc pas de
 * sélecteur de lieu ni de salarié à faire ici, contrairement à PanneauCreationShift (web/admin). */
export function PanneauEditionShiftEquipe({
  visible,
  onClose,
  profil,
  dateIso,
  popUpId,
  shiftsExistants,
  conge,
  creeParId,
}: {
  visible: boolean;
  onClose: () => void;
  profil: Profile | null;
  dateIso: string;
  popUpId: string | undefined;
  shiftsExistants: PlanningShift[];
  /** Congé/indisponibilité de cette personne ce jour-là, s'il y en a un — avertit avant d'ajouter
   * un créneau plutôt que de l'empêcher (cf. même logique que admin/calendrier.tsx). */
  conge: Conge | undefined;
  creeParId: string | undefined;
}) {
  const [heureDebut, setHeureDebut] = useState(() => heureVersDate('10:00'));
  const [heureFin, setHeureFin] = useState(() => heureVersDate('19:00'));
  const [pauseActive, setPauseActive] = useState(false);
  const [heureDebutPause, setHeureDebutPause] = useState(() => heureVersDate('13:00'));
  const [heureFinPause, setHeureFinPause] = useState(() => heureVersDate('14:00'));
  const [pickerOuvert, setPickerOuvert] = useState<ModePicker>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setHeureDebut(heureVersDate('10:00'));
    setHeureFin(heureVersDate('19:00'));
    setPauseActive(false);
    setHeureDebutPause(heureVersDate('13:00'));
    setHeureFinPause(heureVersDate('14:00'));
    setPickerOuvert(null);
  }, [visible, dateIso, profil?.id]);

  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, geste) => Math.abs(geste.dy) > 6,
      onPanResponderMove: (_e, geste) => {
        if (geste.dy > 0) translateY.setValue(geste.dy);
      },
      onPanResponderRelease: (_e, geste) => {
        if (geste.dy > 100 || geste.vy > 0.8) {
          Animated.timing(translateY, { toValue: 800, duration: 180, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  if (!visible || !profil) return null;

  const nom = profil.nom_complet || profil.email;

  const confirmerEtAjouter = async () => {
    const hDebut = `${dateVersHeure(heureDebut)}:00`;
    const hFin = `${dateVersHeure(heureFin)}:00`;
    if (hFin <= hDebut) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }
    const hDebutPause = `${dateVersHeure(heureDebutPause)}:00`;
    const hFinPause = `${dateVersHeure(heureFinPause)}:00`;
    if (pauseActive && (hFinPause <= hDebutPause || hDebutPause < hDebut || hFinPause > hFin)) {
      Alert.alert('Pause invalide', "La pause doit être comprise dans le créneau, heure de fin après l'heure de début.");
      return;
    }
    if (!popUpId) return;

    const chevauche = shiftsExistants.some((s) => seChevauchent(s.heure_debut, s.heure_fin, hDebut, hFin));
    const alertes = [
      chevauche && 'Ce créneau chevauche un shift déjà existant pour cette personne.',
      conge && `${nom} est déclaré(e) absent(e) ce jour-là (${conge.type}).`,
    ].filter(Boolean) as string[];

    const creer = async () => {
      setEnvoiEnCours(true);
      try {
        await insererShifts([
          {
            pop_up_id: popUpId,
            profile_id: profil.id,
            date: dateIso,
            heure_debut: hDebut,
            heure_fin: hFin,
            pause_debut: pauseActive ? hDebutPause : null,
            pause_fin: pauseActive ? hFinPause : null,
            statut: 'brouillon',
            genere_automatiquement: false,
            created_by: creeParId ?? profil.id,
            etiquette: null,
          },
        ]);
        onClose();
      } catch (error) {
        Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de créer le créneau.');
      } finally {
        setEnvoiEnCours(false);
      }
    };

    if (alertes.length > 0) {
      Alert.alert('Attention', `${alertes.join('\n')}\n\nCréer quand même ce créneau ?`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Créer quand même', onPress: creer },
      ]);
      return;
    }
    creer();
  };

  const handleSupprimer = (shift: PlanningShift) => {
    Alert.alert('Supprimer', `Supprimer ce créneau (${shift.heure_debut.slice(0, 5)}-${shift.heure_fin.slice(0, 5)}) ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setSuppressionId(shift.id);
          try {
            await supprimerShift(shift.id);
          } catch (error) {
            Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de supprimer le créneau.');
          } finally {
            setSuppressionId(null);
          }
        },
      },
    ]);
  };

  return (
    <Pressable style={styles.fond} onPress={onClose}>
      <AnimatedPressable style={[styles.feuille, { transform: [{ translateY }] }]} onPress={() => {}}>
        <View {...panResponder.panHandlers}>
          <View style={styles.poignee} />
        </View>
        <Text style={styles.titre}>{nom}</Text>
        <Text style={styles.sousTitre}>{formatDateAffichee(dateIso)}</Text>

        {!!conge && (
          <View style={styles.bandeauConge}>
            <Text style={styles.bandeauCongeTexte}>Déclaré(e) absent(e) ce jour-là ({conge.type}).</Text>
          </View>
        )}

        {shiftsExistants.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Créneaux existants</Text>
            {shiftsExistants.map((s) => (
              <View key={s.id} style={styles.ligneShiftExistant}>
                <Text style={styles.shiftExistantTexte}>
                  {formatCreneauShift(s)}
                  {s.etiquette ? ` · ${s.etiquette}` : ''}
                </Text>
                <Pressable onPress={() => handleSupprimer(s)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={styles.croix}>{suppressionId === s.id ? '…' : '✕'}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.label, { marginTop: 16 }]}>Ajouter un créneau</Text>
        <View style={styles.ligneChamps}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sousLabel}>De</Text>
            <Pressable onPress={() => setPickerOuvert('debut')} style={styles.champ}>
              <Text style={styles.champTexte}>{dateVersHeure(heureDebut)}</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sousLabel}>À</Text>
            <Pressable onPress={() => setPickerOuvert('fin')} style={styles.champ}>
              <Text style={styles.champTexte}>{dateVersHeure(heureFin)}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => setPauseActive((v) => !v)} style={styles.ligneCase}>
          <View style={[styles.case, pauseActive && styles.caseCochee]}>
            {pauseActive && <Text style={styles.caseCoche}>✓</Text>}
          </View>
          <Text style={styles.caseTexte}>Pause déjeuner</Text>
        </Pressable>
        {pauseActive && (
          <View style={[styles.ligneChamps, { marginTop: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sousLabel}>De</Text>
              <Pressable onPress={() => setPickerOuvert('pauseDebut')} style={styles.champ}>
                <Text style={styles.champTexte}>{dateVersHeure(heureDebutPause)}</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sousLabel}>À</Text>
              <Pressable onPress={() => setPickerOuvert('pauseFin')} style={styles.champ}>
                <Text style={styles.champTexte}>{dateVersHeure(heureFinPause)}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {pickerOuvert && Platform.OS === 'web' && (
          <input
            type="time"
            value={dateVersHeure(
              pickerOuvert === 'debut'
                ? heureDebut
                : pickerOuvert === 'fin'
                  ? heureFin
                  : pickerOuvert === 'pauseDebut'
                    ? heureDebutPause
                    : heureFinPause,
            )}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const valeur = event.target.value;
              if (!valeur) return;
              const date = heureVersDate(valeur);
              if (pickerOuvert === 'debut') setHeureDebut(date);
              else if (pickerOuvert === 'fin') setHeureFin(date);
              else if (pickerOuvert === 'pauseDebut') setHeureDebutPause(date);
              else setHeureFinPause(date);
              setPickerOuvert(null);
            }}
            style={styles.champInputWeb as unknown as CSSProperties}
          />
        )}
        {pickerOuvert &&
          Platform.OS !== 'web' &&
          createElement(DateTimePicker, {
            value:
              pickerOuvert === 'debut'
                ? heureDebut
                : pickerOuvert === 'fin'
                  ? heureFin
                  : pickerOuvert === 'pauseDebut'
                    ? heureDebutPause
                    : heureFinPause,
            mode: 'time',
            is24Hour: true,
            display: Platform.OS === 'ios' ? 'spinner' : 'default',
            onChange: (event: { type: string }, valeur?: Date) => {
              if (Platform.OS === 'android') setPickerOuvert(null);
              if (event.type === 'dismissed' || !valeur) return;
              if (pickerOuvert === 'debut') setHeureDebut(valeur);
              else if (pickerOuvert === 'fin') setHeureFin(valeur);
              else if (pickerOuvert === 'pauseDebut') setHeureDebutPause(valeur);
              else setHeureFinPause(valeur);
            },
          })}
        {Platform.OS === 'ios' && pickerOuvert && (
          <Pressable onPress={() => setPickerOuvert(null)} style={{ marginBottom: 8, alignItems: 'center' }}>
            <Text style={styles.ok}>OK</Text>
          </Pressable>
        )}

        <View style={styles.ligneBoutons}>
          <Pressable onPress={onClose} style={styles.boutonAnnuler}>
            <Text style={styles.boutonAnnulerTexte}>Fermer</Text>
          </Pressable>
          <Pressable onPress={confirmerEtAjouter} style={styles.boutonValider} disabled={envoiEnCours}>
            <Text style={styles.boutonValiderTexte}>{envoiEnCours ? 'Ajout…' : 'Ajouter'}</Text>
          </Pressable>
        </View>
      </AnimatedPressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20, paddingBottom: 32 },
  poignee: { marginBottom: 16, height: 6, width: 48, alignSelf: 'center', borderRadius: 3, backgroundColor: '#E2E8F0' },
  titre: { fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  sousTitre: { marginTop: 2, fontSize: 14, color: '#94A3B8' },
  bandeauConge: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bandeauCongeTexte: { fontSize: 13, fontWeight: '600', color: '#B91C1C' },
  label: { marginBottom: 6, fontSize: 12, fontWeight: '600', color: '#334155' },
  sousLabel: { marginBottom: 4, fontSize: 12, color: '#94A3B8' },
  ligneShiftExistant: {
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  shiftExistantTexte: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  croix: { fontSize: 16, color: '#CBD5E1' },
  ligneChamps: { flexDirection: 'row', gap: 12 },
  ligneCase: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  case: {
    height: 18,
    width: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseCochee: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  caseCoche: { fontSize: 11, color: 'white', fontWeight: '700' },
  caseTexte: { fontSize: 13, fontWeight: '600', color: '#334155' },
  champ: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 12 },
  champTexte: { textAlign: 'center', color: '#1E293B' },
  champInputWeb: {
    marginBottom: 8,
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: 'center',
    color: '#1E293B',
    fontSize: 14,
  },
  ok: { fontSize: 14, fontWeight: '600', color: '#4F46E5' },
  ligneBoutons: { marginTop: 16, flexDirection: 'row', gap: 12 },
  boutonAnnuler: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
  },
  boutonAnnulerTexte: { fontWeight: '600', color: '#475569' },
  boutonValider: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#4F46E5', paddingVertical: 12 },
  boutonValiderTexte: { fontWeight: '600', color: 'white' },
});
