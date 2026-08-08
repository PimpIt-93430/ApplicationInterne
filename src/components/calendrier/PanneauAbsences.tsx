/** @jsxImportSource react */
// Composant en StyleSheet (pas de className) : même contrainte que PanneauIndisponibilites.tsx,
// évite le bug NativeWind rencontré avec le sélecteur de date natif.
import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCongesProfile, useGererConges } from '@/hooks/useConges';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { dateEnISO } from '@/utils/dateUtils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ModePicker = 'date_debut' | 'date_fin' | null;
type Motif = 'maladie' | 'autre';

function formatDateAffichee(date: Date): string {
  const txt = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** Signaler une absence (maladie ou autre) déjà effective — pas une demande soumise à validation,
 * juste un constat immédiat comme les indisponibilités (utile pour le suivi RH/paie plus tard). */
export function PanneauAbsences() {
  const profile = useProfilEffectif();
  const { data: conges } = useCongesProfile(profile?.id);
  const absences = (conges ?? []).filter((c) => c.type === 'absence');
  const { ajouter, supprimer } = useGererConges(profile?.id);

  const [modalOuverte, setModalOuverte] = useState(false);
  const [motif, setMotif] = useState<Motif>('maladie');
  const [noteAutre, setNoteAutre] = useState('');
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [pickerOuvert, setPickerOuvert] = useState<ModePicker>(null);

  const ouvrirModal = () => {
    setMotif('maladie');
    setNoteAutre('');
    setDateDebut(new Date());
    setDateFin(new Date());
    setModalOuverte(true);
  };

  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (modalOuverte) translateY.setValue(0);
  }, [modalOuverte, translateY]);
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
            setModalOuverte(false);
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const handleSignaler = () => {
    if (dateFin < dateDebut) {
      Alert.alert('Dates invalides', 'La date de fin doit être après la date de début.');
      return;
    }
    const note = motif === 'maladie' ? 'Maladie' : noteAutre.trim() || 'Autre';
    ajouter.mutate(
      {
        dateDebut: dateEnISO(dateDebut),
        dateFin: dateEnISO(dateFin),
        heureDebut: null,
        heureFin: null,
        type: 'absence',
        note,
      },
      { onSuccess: () => setModalOuverte(false) },
    );
  };

  return (
    <View style={styles.ecran}>
      <View style={styles.entete}>
        <View>
          <Text style={styles.titre}>Mes absences</Text>
          <Text style={styles.sousTitre}>Maladie ou autre — à signaler dès que possible</Text>
        </View>
        <Pressable onPress={ouvrirModal} style={styles.boutonPlus}>
          <Text style={styles.boutonPlusTexte}>+</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {absences.length > 0 ? (
          absences.map((c) => (
            <View key={c.id} style={styles.carte}>
              <View style={styles.carteBarre} />
              <View style={styles.carteContenu}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.carteDate}>
                    {formatDateAffichee(new Date(c.date_debut + 'T00:00:00'))}
                    {c.date_fin !== c.date_debut
                      ? ` → ${formatDateAffichee(new Date(c.date_fin + 'T00:00:00'))}`
                      : ''}
                  </Text>
                  <Text style={styles.carteNote}>{c.note || 'Autre'}</Text>
                </View>
                {c.date_fin >= dateEnISO(new Date()) && (
                  <Pressable
                    onPress={() => supprimer.mutate(c)}
                    style={{ paddingHorizontal: 8, paddingVertical: 8 }}
                  >
                    <Text style={styles.croix}>✕</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.vide}>
            <Text style={styles.videTexte}>Aucune absence signalée.</Text>
            <Text style={styles.videSousTexte}>Touchez + pour en signaler une.</Text>
          </View>
        )}
      </ScrollView>

      {modalOuverte && (
        <Pressable style={styles.fond} onPress={() => setModalOuverte(false)}>
          <AnimatedPressable style={[styles.feuille, { transform: [{ translateY }] }]} onPress={() => {}}>
            <View {...panResponder.panHandlers}>
              <View style={styles.poignee} />
            </View>
            <Text style={styles.feuilleTitre}>Signaler une absence</Text>

            <View style={styles.segment}>
              <Pressable
                onPress={() => setMotif('maladie')}
                style={[styles.segmentBouton, motif === 'maladie' && styles.segmentBoutonActif]}
              >
                <Text style={motif === 'maladie' ? styles.segmentTexteActif : styles.segmentTexte}>
                  Maladie
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMotif('autre')}
                style={[styles.segmentBouton, motif === 'autre' && styles.segmentBoutonActif]}
              >
                <Text style={motif === 'autre' ? styles.segmentTexteActif : styles.segmentTexte}>Autre</Text>
              </Pressable>
            </View>

            {motif === 'autre' && (
              <TextInput
                value={noteAutre}
                onChangeText={setNoteAutre}
                placeholder="Précise le motif..."
                style={[styles.champ, { marginBottom: 12 }]}
              />
            )}

            <View style={styles.ligneChamps}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Du</Text>
                <Pressable onPress={() => setPickerOuvert('date_debut')} style={styles.champ}>
                  <Text style={styles.champTexte}>{formatDateAffichee(dateDebut)}</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Au</Text>
                <Pressable onPress={() => setPickerOuvert('date_fin')} style={styles.champ}>
                  <Text style={styles.champTexte}>{formatDateAffichee(dateFin)}</Text>
                </Pressable>
              </View>
            </View>

            {pickerOuvert && Platform.OS === 'web' && (
              <input
                type="date"
                value={pickerOuvert === 'date_debut' ? dateEnISO(dateDebut) : dateEnISO(dateFin)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const texte = event.target.value;
                  if (!texte) return;
                  const valeur = new Date(`${texte}T00:00:00`);
                  if (pickerOuvert === 'date_debut') setDateDebut(valeur);
                  else setDateFin(valeur);
                  setPickerOuvert(null);
                }}
                style={styles.champInputWeb as unknown as CSSProperties}
              />
            )}
            {pickerOuvert &&
              Platform.OS !== 'web' &&
              createElement(DateTimePicker, {
                value: pickerOuvert === 'date_debut' ? dateDebut : dateFin,
                mode: 'date',
                display: Platform.OS === 'ios' ? 'spinner' : 'default',
                onChange: (event: { type: string }, valeur?: Date) => {
                  if (Platform.OS === 'android') setPickerOuvert(null);
                  if (event.type === 'dismissed' || !valeur) return;
                  if (pickerOuvert === 'date_debut') setDateDebut(valeur);
                  else setDateFin(valeur);
                },
              })}

            {Platform.OS === 'ios' && pickerOuvert && (
              <Pressable onPress={() => setPickerOuvert(null)} style={{ marginBottom: 8, alignItems: 'center' }}>
                <Text style={styles.ok}>OK</Text>
              </Pressable>
            )}

            <View style={styles.ligneBoutons}>
              <Pressable onPress={() => setModalOuverte(false)} style={styles.boutonAnnuler}>
                <Text style={styles.boutonAnnulerTexte}>Annuler</Text>
              </Pressable>
              <Pressable onPress={handleSignaler} style={styles.boutonValider}>
                <Text style={styles.boutonValiderTexte}>
                  {ajouter.isPending ? 'Envoi…' : 'Signaler'}
                </Text>
              </Pressable>
            </View>
          </AnimatedPressable>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  titre: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  sousTitre: { fontSize: 14, color: '#94A3B8' },
  boutonPlus: {
    height: 48,
    width: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  boutonPlusTexte: { fontSize: 24, color: 'white' },
  carte: {
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: 'white',
  },
  carteBarre: { width: 6, backgroundColor: '#FB923C' },
  carteContenu: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  carteDate: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  carteNote: { marginTop: 2, fontSize: 14, color: '#94A3B8' },
  croix: { fontSize: 18, color: '#CBD5E1' },
  vide: { alignItems: 'center', paddingVertical: 64 },
  videTexte: { fontSize: 14, color: '#94A3B8' },
  videSousTexte: { marginTop: 4, fontSize: 14, color: '#CBD5E1' },
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20, paddingBottom: 32 },
  poignee: { marginBottom: 16, height: 6, width: 48, alignSelf: 'center', borderRadius: 3, backgroundColor: '#E2E8F0' },
  feuilleTitre: { marginBottom: 16, fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  segment: { marginBottom: 16, flexDirection: 'row', borderRadius: 12, backgroundColor: '#F1F5F9', padding: 4 },
  segmentBouton: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 8 },
  segmentBoutonActif: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentTexte: { color: '#64748B' },
  segmentTexteActif: { fontWeight: '600', color: '#4F46E5' },
  ligneChamps: { marginBottom: 8, flexDirection: 'row', gap: 12 },
  label: { marginBottom: 4, fontSize: 12, color: '#94A3B8' },
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
  ligneBoutons: { marginTop: 12, flexDirection: 'row', gap: 12 },
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
