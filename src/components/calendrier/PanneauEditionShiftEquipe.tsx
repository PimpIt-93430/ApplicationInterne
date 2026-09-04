/** @jsxImportSource react */
// Composant en StyleSheet (pas de className) : même contrainte que PanneauDemandesConge.tsx,
// évite le bug NativeWind rencontré avec le sélecteur natif (ici un sélecteur d'heure).
import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { insererShifts, supprimerShift } from '@/api/planning';
import type { Conge, PlanningShift, PopUp, Profile } from '@/types/database.types';
import { formatCreneauShift } from '@/utils/dateUtils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ModePicker = 'debut' | 'fin' | 'pauseDebut' | 'pauseFin' | null;
type Preset = 'matin' | 'apres_midi' | 'personnalise';

type DefinitionPreset = { label: string; debut: string; pauseDebut: string; pauseFin: string; fin: string };

// Génériques, utilisés seulement quand le pop-up n'a pas ses propres créneaux réglés (cf. écran
// Pop-up, colonnes matin_debut/matin_fin/apres_midi_debut/apres_midi_fin) — même repli que
// HoraireRecurrentJourCard, pour rester cohérent entre l'horaire récurrent d'un employé et
// l'ajout ponctuel d'un créneau depuis la grille équipe.
const PRESETS_GENERIQUES: Record<Exclude<Preset, 'personnalise'>, DefinitionPreset> = {
  matin: { label: 'Matin (10h-18h)', debut: '10:00', pauseDebut: '13:00', pauseFin: '14:00', fin: '18:00' },
  apres_midi: { label: 'Après-midi (13h-20h30)', debut: '13:00', pauseDebut: '16:00', pauseFin: '16:30', fin: '20:30' },
};

/** Créneaux Matin/Après-midi réglés pour ce pop-up (écran Pop-up) s'il y en a, sinon repli sur les
 * génériques ci-dessus — corrige le bug où "Après-midi" appliquait toujours 13h-20h30 même quand
 * le lieu avait ses propres horaires (ex. Oparinord : 13h-20h), cf. retour utilisateur. */
function presetsPourPopUp(popUp: PopUp | undefined): Record<Exclude<Preset, 'personnalise'>, DefinitionPreset> {
  const matin =
    popUp?.matin_debut && popUp?.matin_fin
      ? {
          label: `Matin (${popUp.matin_debut.slice(0, 5)}-${popUp.matin_fin.slice(0, 5)})`,
          debut: popUp.matin_debut.slice(0, 5),
          fin: popUp.matin_fin.slice(0, 5),
          pauseDebut: (popUp.matin_pause_debut ?? PRESETS_GENERIQUES.matin.pauseDebut).slice(0, 5),
          pauseFin: (popUp.matin_pause_fin ?? PRESETS_GENERIQUES.matin.pauseFin).slice(0, 5),
        }
      : PRESETS_GENERIQUES.matin;
  const apresMidi =
    popUp?.apres_midi_debut && popUp?.apres_midi_fin
      ? {
          label: `Après-midi (${popUp.apres_midi_debut.slice(0, 5)}-${popUp.apres_midi_fin.slice(0, 5)})`,
          debut: popUp.apres_midi_debut.slice(0, 5),
          fin: popUp.apres_midi_fin.slice(0, 5),
          pauseDebut: (popUp.apres_midi_pause_debut ?? PRESETS_GENERIQUES.apres_midi.pauseDebut).slice(0, 5),
          pauseFin: (popUp.apres_midi_pause_fin ?? PRESETS_GENERIQUES.apres_midi.pauseFin).slice(0, 5),
        }
      : PRESETS_GENERIQUES.apres_midi;
  return { matin, apres_midi: apresMidi };
}

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
  popUp,
  shiftsExistants,
  conge,
  creeParId,
}: {
  visible: boolean;
  onClose: () => void;
  profil: Profile | null;
  dateIso: string;
  popUpId: string | undefined;
  /** Pour lire les créneaux Matin/Après-midi propres à ce lieu (cf. presetsPourPopUp) — repli sur
   * les génériques si absent/non fourni. */
  popUp: PopUp | undefined;
  shiftsExistants: PlanningShift[];
  /** Congé/indisponibilité de cette personne ce jour-là, s'il y en a un — avertit avant d'ajouter
   * un créneau plutôt que de l'empêcher (cf. même logique que admin/calendrier.tsx). */
  conge: Conge | undefined;
  creeParId: string | undefined;
}) {
  const [heureDebut, setHeureDebut] = useState(() => heureVersDate('10:00'));
  const [heureFin, setHeureFin] = useState(() => heureVersDate('19:00'));
  const [heureDebutPause, setHeureDebutPause] = useState(() => heureVersDate('13:00'));
  const [heureFinPause, setHeureFinPause] = useState(() => heureVersDate('14:00'));
  const [presetActif, setPresetActif] = useState<Preset | null>(null);
  // Un employé peut retirer la pause pour un créneau continu (ex. petit shift du soir) — un lien
  // "Retirer la pause", pas une case à cocher devant les champs (cf. demande explicite : plus de
  // "truc où tu tiques pause déjeuner"). Toujours false pour un admin (jamais de pause, cf. estAdmin).
  const [sansPause, setSansPause] = useState(false);
  const [pickerOuvert, setPickerOuvert] = useState<ModePicker>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setHeureDebut(heureVersDate('10:00'));
    setHeureFin(heureVersDate('19:00'));
    setHeureDebutPause(heureVersDate('13:00'));
    setHeureFinPause(heureVersDate('14:00'));
    setPresetActif(null);
    setSansPause(false);
    setPickerOuvert(null);
  }, [visible, dateIso, profil?.id]);

  const presets = presetsPourPopUp(popUp);

  // Un tap sur "Matin"/"Après-midi" remplit les 4 horaires d'un coup (fini les 4 allers-retours au
  // sélecteur natif) ; les champs restent modifiables juste en dessous pour ajuster au cas par cas.
  const appliquerPreset = (preset: Exclude<Preset, 'personnalise'>) => {
    const p = presets[preset];
    setHeureDebut(heureVersDate(p.debut));
    setHeureDebutPause(heureVersDate(p.pauseDebut));
    setHeureFinPause(heureVersDate(p.pauseFin));
    setHeureFin(heureVersDate(p.fin));
    setPresetActif(preset);
    setSansPause(false);
  };

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
  // Un admin n'a pas de coupure repas suivie sur le planning — juste une plage continue, pas les
  // présets/champs "avant/après la pause" pensés pour les shifts d'équipe.
  const estAdmin = profil.role === 'admin';

  const confirmerEtAjouter = async () => {
    const hDebut = `${dateVersHeure(heureDebut)}:00`;
    const hFin = `${dateVersHeure(heureFin)}:00`;
    if (hFin <= hDebut) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }
    const hDebutPause = `${dateVersHeure(heureDebutPause)}:00`;
    const hFinPause = `${dateVersHeure(heureFinPause)}:00`;
    // Heures de pause identiques (ex. laissées telles quelles pour un créneau court sans coupure)
    // = pas de pause, plutôt qu'une case à décocher. Jamais de pause pour un admin (champs non
    // affichés/modifiables pour lui) ni quand "Retirer la pause" a été utilisé (cf. sansPause).
    const aUnePause = !estAdmin && !sansPause && hDebutPause !== hFinPause;
    if (aUnePause && (hFinPause <= hDebutPause || hDebutPause < hDebut || hFinPause > hFin)) {
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
            pause_debut: aUnePause ? hDebutPause : null,
            pause_fin: aUnePause ? hFinPause : null,
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

        {estAdmin ? (
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
        ) : (
          <>
            <View style={styles.lignePresets}>
              {(Object.keys(presets) as Exclude<Preset, 'personnalise'>[]).map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => appliquerPreset(preset)}
                  style={[styles.chipPreset, presetActif === preset && styles.chipPresetActif]}
                >
                  <Text style={[styles.chipPresetTexte, presetActif === preset && styles.chipPresetTexteActif]}>
                    {presets[preset].label}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setPresetActif('personnalise')}
                style={[styles.chipPreset, presetActif === 'personnalise' && styles.chipPresetActif]}
              >
                <Text
                  style={[styles.chipPresetTexte, presetActif === 'personnalise' && styles.chipPresetTexteActif]}
                >
                  Personnalisé
                </Text>
              </Pressable>
            </View>

            {sansPause ? (
              <>
                <Text style={[styles.sousLabel, { marginTop: 12 }]}>Créneau</Text>
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
                <Pressable onPress={() => setSansPause(false)} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                  <Text style={styles.lienPause}>+ Ajouter une pause déjeuner</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.sousLabel, { marginTop: 12 }]}>Avant la pause</Text>
                <View style={styles.ligneChamps}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>De</Text>
                    <Pressable onPress={() => setPickerOuvert('debut')} style={styles.champ}>
                      <Text style={styles.champTexte}>{dateVersHeure(heureDebut)}</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>À</Text>
                    <Pressable onPress={() => setPickerOuvert('pauseDebut')} style={styles.champ}>
                      <Text style={styles.champTexte}>{dateVersHeure(heureDebutPause)}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.ligneLabelAvecLien, { marginTop: 12 }]}>
                  <Text style={styles.sousLabel}>Après la pause</Text>
                  <Pressable onPress={() => setSansPause(true)}>
                    <Text style={styles.lienPause}>✕ Retirer la pause</Text>
                  </Pressable>
                </View>
                <View style={styles.ligneChamps}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>De</Text>
                    <Pressable onPress={() => setPickerOuvert('pauseFin')} style={styles.champ}>
                      <Text style={styles.champTexte}>{dateVersHeure(heureFinPause)}</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sousLabel}>À</Text>
                    <Pressable onPress={() => setPickerOuvert('fin')} style={styles.champ}>
                      <Text style={styles.champTexte}>{dateVersHeure(heureFin)}</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            )}
          </>
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
              setPresetActif('personnalise');
              setPickerOuvert(null);
            }}
            style={styles.champInputWeb as unknown as CSSProperties}
          />
        )}
        {pickerOuvert &&
          Platform.OS !== 'web' &&
          createElement(DateTimePicker, {
            // Cf. retour utilisateur du 2026-09-05 : "je mets le matin, il finit à 19h, je peux pas
            // bouger et mettre 17h, la roulette va automatiquement à 1h du matin" — sans `key`,
            // React ne remonte jamais la vue native quand on passe d'un champ à l'autre (debut/fin/
            // pauseDebut/pauseFin réutilisent la même instance de UIDatePicker sur iOS), qui garde
            // alors un état de scroll interne périmé et « saute » à une valeur incohérente au
            // premier geste sur le nouveau champ. La clé force un remontage propre à chaque
            // ouverture d'un champ différent.
            key: pickerOuvert,
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
              setPresetActif('personnalise');
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
  lignePresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipPreset: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipPresetActif: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  chipPresetTexte: { fontSize: 13, fontWeight: '600', color: '#334155' },
  chipPresetTexteActif: { color: 'white' },
  ligneLabelAvecLien: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lienPause: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },
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
