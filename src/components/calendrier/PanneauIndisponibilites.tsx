/** @jsxImportSource react */
// Composant en StyleSheet (pas de className) : évite le bug NativeWind rencontré avec le
// sélecteur de date/heure natif.
import DateTimePicker from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCongesProfile, useGererConges } from '@/hooks/useConges';
import { useAuthStore } from '@/store/useAuthStore';
import { dateEnISO, formatHeure } from '@/utils/dateUtils';

type ModePicker = 'date_debut' | 'date_fin' | 'heure_debut' | 'heure_fin' | null;
type ModeDuree = 'journee' | 'creneau';

function formatDateAffichee(date: Date): string {
  const txt = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function formatHeureAffichee(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function PanneauIndisponibilites() {
  const profile = useAuthStore((s) => s.profile);
  const { data: conges } = useCongesProfile(profile?.id);
  const { ajouter, supprimer } = useGererConges(profile?.id);

  const [modalOuverte, setModalOuverte] = useState(false);
  const [modeDuree, setModeDuree] = useState<ModeDuree>('journee');
  const [dateDebut, setDateDebut] = useState(new Date());
  const [dateFin, setDateFin] = useState(new Date());
  const [heureDebut, setHeureDebut] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [heureFin, setHeureFin] = useState(() => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    return d;
  });
  const [pickerOuvert, setPickerOuvert] = useState<ModePicker>(null);

  const ouvrirModal = () => {
    setModeDuree('journee');
    setDateDebut(new Date());
    setDateFin(new Date());
    setModalOuverte(true);
  };

  const handleDeclarer = () => {
    if (modeDuree === 'journee' && dateFin < dateDebut) {
      Alert.alert('Dates invalides', 'La date de fin doit être après la date de début.');
      return;
    }
    if (modeDuree === 'creneau' && heureFin <= heureDebut) {
      Alert.alert('Heures invalides', "L'heure de fin doit être après l'heure de début.");
      return;
    }

    ajouter.mutate(
      {
        dateDebut: dateEnISO(dateDebut),
        dateFin: modeDuree === 'journee' ? dateEnISO(dateFin) : dateEnISO(dateDebut),
        heureDebut: modeDuree === 'creneau' ? formatHeureAffichee(heureDebut) + ':00' : null,
        heureFin: modeDuree === 'creneau' ? formatHeureAffichee(heureFin) + ':00' : null,
        type: 'indisponibilite',
        note: '',
      },
      { onSuccess: () => setModalOuverte(false) },
    );
  };

  return (
    <View style={styles.ecran}>
      <View style={styles.entete}>
        <View>
          <Text style={styles.titre}>Mes indisponibilités</Text>
          <Text style={styles.sousTitre}>Journées ou créneaux où vous n'êtes pas là</Text>
        </View>
        <Pressable onPress={ouvrirModal} style={styles.boutonPlus}>
          <Text style={styles.boutonPlusTexte}>+</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        {conges && conges.length > 0 ? (
          conges.map((c) => (
            <View key={c.id} style={styles.carte}>
              <View style={styles.carteBarre} />
              <View style={styles.carteContenu}>
                <View>
                  <Text style={styles.carteDate}>
                    {formatDateAffichee(new Date(c.date_debut + 'T00:00:00'))}
                    {c.date_fin !== c.date_debut
                      ? ` → ${formatDateAffichee(new Date(c.date_fin + 'T00:00:00'))}`
                      : ''}
                  </Text>
                  <Text style={styles.carteHeure}>
                    {c.heure_debut && c.heure_fin
                      ? `${formatHeure(c.heure_debut)} – ${formatHeure(c.heure_fin)}`
                      : 'Toute la journée'}
                  </Text>
                </View>
                <Pressable onPress={() => supprimer.mutate(c.id)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                  <Text style={styles.croix}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.vide}>
            <Text style={styles.videTexte}>Aucune indisponibilité déclarée.</Text>
            <Text style={styles.videSousTexte}>Touchez + pour en ajouter une.</Text>
          </View>
        )}
      </ScrollView>

      {modalOuverte && (
        <View style={styles.fond}>
          <View style={styles.feuille}>
            <View style={styles.poignee} />
            <Text style={styles.feuilleTitre}>Nouvelle indisponibilité</Text>

            <View style={styles.segment}>
              <Pressable
                onPress={() => setModeDuree('journee')}
                style={[styles.segmentBouton, modeDuree === 'journee' && styles.segmentBoutonActif]}
              >
                <Text style={modeDuree === 'journee' ? styles.segmentTexteActif : styles.segmentTexte}>
                  Journée(s) complète(s)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setModeDuree('creneau')}
                style={[styles.segmentBouton, modeDuree === 'creneau' && styles.segmentBoutonActif]}
              >
                <Text style={modeDuree === 'creneau' ? styles.segmentTexteActif : styles.segmentTexte}>
                  Un créneau (ex. 15h-18h)
                </Text>
              </Pressable>
            </View>

            {modeDuree === 'journee' ? (
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
            ) : (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Jour</Text>
                <Pressable onPress={() => setPickerOuvert('date_debut')} style={[styles.champ, { marginBottom: 12 }]}>
                  <Text style={styles.champTexte}>{formatDateAffichee(dateDebut)}</Text>
                </Pressable>
                <View style={styles.ligneChamps}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>De</Text>
                    <Pressable onPress={() => setPickerOuvert('heure_debut')} style={styles.champ}>
                      <Text style={styles.champTexte}>{formatHeureAffichee(heureDebut)}</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>À</Text>
                    <Pressable onPress={() => setPickerOuvert('heure_fin')} style={styles.champ}>
                      <Text style={styles.champTexte}>{formatHeureAffichee(heureFin)}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {pickerOuvert &&
              createElement(DateTimePicker, {
                value:
                  pickerOuvert === 'date_debut'
                    ? dateDebut
                    : pickerOuvert === 'date_fin'
                      ? dateFin
                      : pickerOuvert === 'heure_debut'
                        ? heureDebut
                        : heureFin,
                mode: pickerOuvert === 'heure_debut' || pickerOuvert === 'heure_fin' ? 'time' : 'date',
                display: Platform.OS === 'ios' ? 'spinner' : 'default',
                onChange: (event: { type: string }, valeur?: Date) => {
                  if (Platform.OS === 'android') setPickerOuvert(null);
                  if (event.type === 'dismissed' || !valeur) return;
                  if (pickerOuvert === 'date_debut') setDateDebut(valeur);
                  else if (pickerOuvert === 'date_fin') setDateFin(valeur);
                  else if (pickerOuvert === 'heure_debut') setHeureDebut(valeur);
                  else setHeureFin(valeur);
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
              <Pressable onPress={handleDeclarer} style={styles.boutonValider}>
                <Text style={styles.boutonValiderTexte}>Déclarer</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
  carteBarre: { width: 6, backgroundColor: '#F87171' },
  carteContenu: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  carteDate: { fontSize: 16, fontWeight: '600', color: '#1E293B' },
  carteHeure: { marginTop: 2, fontSize: 14, color: '#94A3B8' },
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
