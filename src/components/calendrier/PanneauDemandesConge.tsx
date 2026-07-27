/** @jsxImportSource react */
// Composant en StyleSheet (pas de className) : même contrainte que PanneauIndisponibilites.tsx,
// évite le bug NativeWind rencontré avec le sélecteur de date natif.
import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCongesProfile, useDemanderConge, useGererConges } from '@/hooks/useConges';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import type { StatutConge } from '@/types/database.types';
import { dateEnISO } from '@/utils/dateUtils';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ModePicker = 'date_debut' | 'date_fin' | null;

function formatDateAffichee(date: Date): string {
  const txt = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

const STATUT_LABEL: Record<StatutConge, string> = {
  en_attente: 'En attente',
  validee: 'Validé',
  refusee: 'Refusé',
};
const STATUT_STYLE: Record<StatutConge, { badge: object; texte: object }> = {
  en_attente: { badge: { backgroundColor: '#FEF3C7' }, texte: { color: '#B45309' } },
  validee: { badge: { backgroundColor: '#D1FAE5' }, texte: { color: '#047857' } },
  refusee: { badge: { backgroundColor: '#FEE2E2' }, texte: { color: '#B91C1C' } },
};

export function PanneauDemandesConge() {
  const profile = useProfilEffectif();
  const { data: conges } = useCongesProfile(profile?.id);
  const demandes = (conges ?? []).filter((c) => c.type === 'conge');
  const demander = useDemanderConge(profile?.id);
  const { supprimer } = useGererConges(profile?.id);

  const [modalOuverte, setModalOuverte] = useState(false);
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [note, setNote] = useState('');
  const [pickerOuvert, setPickerOuvert] = useState<ModePicker>(null);

  const ouvrirModal = () => {
    setDateDebut(new Date());
    setDateFin(new Date());
    setNote('');
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

  const handleDemander = () => {
    if (dateFin < dateDebut) {
      Alert.alert('Dates invalides', 'La date de fin doit être après la date de début.');
      return;
    }
    demander.mutate(
      { dateDebut: dateEnISO(dateDebut), dateFin: dateEnISO(dateFin), note: note.trim() },
      { onSuccess: () => setModalOuverte(false) },
    );
  };

  return (
    <View style={styles.ecran}>
      <View style={styles.entete}>
        <View>
          <Text style={styles.titre}>Mes congés</Text>
          <Text style={styles.sousTitre}>Demandes soumises pour validation</Text>
        </View>
        <Pressable onPress={ouvrirModal} style={styles.boutonPlus}>
          <Text style={styles.boutonPlusTexte}>+</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {demandes.length > 0 ? (
          demandes.map((c) => (
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
                  {!!c.note && <Text style={styles.carteNote}>{c.note}</Text>}
                  <View style={[styles.badge, STATUT_STYLE[c.statut].badge]}>
                    <Text style={[styles.badgeTexte, STATUT_STYLE[c.statut].texte]}>
                      {STATUT_LABEL[c.statut]}
                    </Text>
                  </View>
                </View>
                {c.statut === 'en_attente' && (
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
            <Text style={styles.videTexte}>Aucune demande de congé.</Text>
            <Text style={styles.videSousTexte}>Touchez + pour en soumettre une.</Text>
          </View>
        )}
      </ScrollView>

      {modalOuverte && (
        <Pressable style={styles.fond} onPress={() => setModalOuverte(false)}>
          <AnimatedPressable style={[styles.feuille, { transform: [{ translateY }] }]} onPress={() => {}}>
            <View {...panResponder.panHandlers}>
              <View style={styles.poignee} />
            </View>
            <Text style={styles.feuilleTitre}>Nouvelle demande de congé</Text>

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

            <Text style={styles.label}>Motif (optionnel)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Ex : vacances, rendez-vous..."
              multiline
              style={styles.noteInput}
            />

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
              <Pressable onPress={handleDemander} style={styles.boutonValider}>
                <Text style={styles.boutonValiderTexte}>
                  {demander.isPending ? 'Envoi…' : 'Envoyer la demande'}
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
  carteBarre: { width: 6, backgroundColor: '#818CF8' },
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
  badge: { marginTop: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTexte: { fontSize: 12, fontWeight: '600' },
  croix: { fontSize: 18, color: '#CBD5E1' },
  vide: { alignItems: 'center', paddingVertical: 64 },
  videTexte: { fontSize: 14, color: '#94A3B8' },
  videSousTexte: { marginTop: 4, fontSize: 14, color: '#CBD5E1' },
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  feuille: { borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 20, paddingBottom: 32 },
  poignee: { marginBottom: 16, height: 6, width: 48, alignSelf: 'center', borderRadius: 3, backgroundColor: '#E2E8F0' },
  feuilleTitre: { marginBottom: 16, fontSize: 18, fontWeight: 'bold', color: '#0F172A' },
  ligneChamps: { marginBottom: 12, flexDirection: 'row', gap: 12 },
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
  noteInput: {
    marginBottom: 8,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: 'top',
    color: '#1E293B',
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
