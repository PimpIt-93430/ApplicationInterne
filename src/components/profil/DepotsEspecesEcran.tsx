// Suivi des dépôts en banque du cash SumUp — même contournement du bug NativeWind que
// PanneauAbsences.tsx/RecapVentesEcran.tsx (cf. leurs en-têtes) pour les champs date : un
// <input type="date"> natif sur web, DateTimePicker sur iOS/Android, d'où le StyleSheet plutôt que
// className sur les parties concernées.
import DateTimePicker from '@react-native-community/datetimepicker';
import { endOfDay, format, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createElement, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useAuthStore } from '@/store/useAuthStore';
import { useDepotsEspeces, useGererDepotsEspeces } from '@/hooks/useDepotsEspeces';
import { useVentesSumupPeriode } from '@/hooks/useVentesSumup';

type ChampDateOuvert = 'debut' | 'fin' | 'depot' | null;

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function formatDateCourte(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Un champ date, web (input natif) ou natif (bouton + DateTimePicker) — factorisé ici car l'écran
 * en a besoin à trois reprises (début période, fin période, jour du dépôt). */
function ChampDate({
  label,
  valeur,
  onChange,
  ouvert,
  onOuvrir,
  onFermer,
}: {
  label: string;
  valeur: Date;
  onChange: (d: Date) => void;
  ouvert: boolean;
  onOuvrir: () => void;
  onFermer: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.champLabel}>{label}</Text>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'date',
          value: format(valeur, 'yyyy-MM-dd'),
          onChange: (e: ChangeEvent<HTMLInputElement>) => {
            if (e.target.value) onChange(new Date(`${e.target.value}T00:00:00`));
          },
          style: styles.inputDateWeb as unknown as CSSProperties,
        })
      ) : (
        <Pressable onPress={onOuvrir} style={styles.boutonDateNatif}>
          <Text style={styles.boutonDateNatifTexte}>{format(valeur, 'd MMM yyyy', { locale: fr })}</Text>
        </Pressable>
      )}
      {ouvert &&
        Platform.OS !== 'web' &&
        createElement(DateTimePicker, {
          value: valeur,
          mode: 'date',
          maximumDate: new Date(),
          display: Platform.OS === 'ios' ? 'spinner' : 'default',
          onChange: (event: { type: string }, d?: Date) => {
            if (Platform.OS === 'android') onFermer();
            if (event.type === 'dismissed' || !d) return;
            onChange(d);
          },
        })}
      {Platform.OS === 'ios' && ouvert && (
        <Pressable onPress={onFermer} style={styles.boutonOk}>
          <Text style={styles.boutonOkTexte}>OK</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Onglet Profil (admin uniquement) : pour une période (jour X à jour Y inclus) choisie à la main,
 * affiche le cash SumUp ("Espèce SumUp", moyen_paiement CASH, cf. FinanceEcran.tsx) à déposer en
 * banque — tous pop-up confondus, pas de sélecteur (retour utilisateur explicite) — puis permet de
 * déclarer un dépôt réellement effectué (jour du dépôt, période couverte, montant). Cf. retour
 * utilisateur du 2026-09-01. */
export function DepotsEspecesEcran({ onRetour }: { onRetour: () => void }) {
  const profile = useAuthStore((s) => s.profile);

  const [debut, setDebut] = useState(() => startOfDay(new Date()));
  const [fin, setFin] = useState(() => startOfDay(new Date()));
  const [dateDepot, setDateDepot] = useState(() => startOfDay(new Date()));
  const [montant, setMontant] = useState('');
  const [champOuvert, setChampOuvert] = useState<ChampDateOuvert>(null);

  const { data: ventes, isLoading: chargementVentes } = useVentesSumupPeriode(
    debut.toISOString(),
    endOfDay(fin).toISOString(),
  );
  const { data: depots, isLoading: chargementDepots } = useDepotsEspeces();
  const { ajouter, supprimer } = useGererDepotsEspeces();

  const montantADeposer = (ventes ?? [])
    .filter((v) => v.statut === 'SUCCESSFUL' && v.moyen_paiement === 'CASH')
    .reduce((s, v) => s + v.montant, 0);

  const montantSaisi = Number(montant.replace(',', '.'));
  const peutValider = !!profile && montant.trim() !== '' && !Number.isNaN(montantSaisi) && montantSaisi > 0;

  const valider = () => {
    if (!peutValider || !profile) return;
    ajouter.mutate(
      {
        periodeDebut: format(debut, 'yyyy-MM-dd'),
        periodeFin: format(fin, 'yyyy-MM-dd'),
        dateDepot: format(dateDepot, 'yyyy-MM-dd'),
        montant: montantSaisi,
        profileId: profile.id,
      },
      { onSuccess: () => setMontant('') },
    );
  };

  return (
    <View style={styles.ecran}>
      <EnteteRetour titre="Dépôts espèces" onRetour={onRetour} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.titreSection}>Période à vérifier</Text>
        <View style={styles.ligneChamps}>
          <ChampDate
            label="Du"
            valeur={debut}
            onChange={setDebut}
            ouvert={champOuvert === 'debut'}
            onOuvrir={() => setChampOuvert('debut')}
            onFermer={() => setChampOuvert(null)}
          />
          <ChampDate
            label="Au (inclus)"
            valeur={fin}
            onChange={setFin}
            ouvert={champOuvert === 'fin'}
            onOuvrir={() => setChampOuvert('fin')}
            onFermer={() => setChampOuvert(null)}
          />
        </View>

        <View style={styles.tuile}>
          <Text style={styles.tuileLabel}>Espèce SumUp à déposer</Text>
          {chargementVentes ? (
            <ActivityIndicator color="#6366F1" style={{ marginTop: 6 }} />
          ) : (
            <Text style={styles.tuileValeur}>{formatMontant(montantADeposer)}</Text>
          )}
          <Text style={styles.tuileSousTexte}>
            Cash encaissé au terminal SumUp entre le {format(debut, 'd MMM yyyy', { locale: fr })} et le{' '}
            {format(fin, 'd MMM yyyy', { locale: fr })} inclus, tous pop-up confondus.
          </Text>
        </View>

        <Text style={styles.titreSection}>Déclarer un dépôt effectué</Text>
        <View style={styles.carte}>
          <Text style={styles.champLabel}>Jour du dépôt</Text>
          <ChampDate
            label=""
            valeur={dateDepot}
            onChange={setDateDepot}
            ouvert={champOuvert === 'depot'}
            onOuvrir={() => setChampOuvert('depot')}
            onFermer={() => setChampOuvert(null)}
          />
          <Text style={styles.texteAide}>
            Couvre la période du {format(debut, 'd MMM yyyy', { locale: fr })} au {format(fin, 'd MMM yyyy', { locale: fr })}{' '}
            inclus (celle choisie ci-dessus).
          </Text>
          <Text style={[styles.champLabel, { marginTop: 12 }]}>Montant déposé</Text>
          <TextInput
            value={montant}
            onChangeText={setMontant}
            placeholder="0,00 €"
            keyboardType="decimal-pad"
            style={styles.inputMontant}
          />
          <Pressable
            onPress={valider}
            disabled={!peutValider || ajouter.isPending}
            style={[styles.boutonValider, !peutValider && styles.boutonValiderDesactive]}
          >
            <Text style={[styles.boutonValiderTexte, !peutValider && styles.boutonValiderTexteDesactive]}>
              {ajouter.isPending ? 'Enregistrement…' : 'Enregistrer le dépôt'}
            </Text>
          </Pressable>
          {ajouter.isError && (
            <Text style={styles.texteErreur}>
              Échec : {ajouter.error instanceof Error ? ajouter.error.message : 'erreur inconnue'}
            </Text>
          )}
        </View>

        <Text style={styles.titreSection}>Historique des dépôts</Text>
        {chargementDepots ? (
          <ActivityIndicator color="#6366F1" />
        ) : (depots ?? []).length === 0 ? (
          <Text style={styles.texteAide}>Aucun dépôt déclaré.</Text>
        ) : (
          (depots ?? []).map((d) => (
            <View key={d.id} style={styles.ligneHistorique}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ligneHistoriqueMontant}>{formatMontant(d.montant)}</Text>
                <Text style={styles.ligneHistoriqueSousTexte}>
                  Déposé le {formatDateCourte(d.date_depot)} · période du {formatDateCourte(d.periode_debut)} au{' '}
                  {formatDateCourte(d.periode_fin)}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert('Supprimer ce dépôt', `${formatMontant(d.montant)} du ${formatDateCourte(d.date_depot)}`, [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Supprimer', style: 'destructive', onPress: () => supprimer.mutate(d.id) },
                  ])
                }
              >
                <Text style={styles.lienSupprimer}>Supprimer</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  champLabel: { marginBottom: 6, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  ligneChamps: { flexDirection: 'row', gap: 12 },
  inputDateWeb: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: '#1E293B',
  },
  boutonDateNatif: { borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 10 },
  boutonDateNatifTexte: { fontSize: 13, fontWeight: '600', color: '#1E293B', textTransform: 'capitalize' },
  boutonOk: { alignItems: 'center', marginTop: 4 },
  boutonOkTexte: { fontSize: 15, fontWeight: '700', color: '#4F46E5' },
  texteAide: { marginTop: 8, fontSize: 12, color: '#94A3B8' },
  titreSection: { marginBottom: 8, marginTop: 20, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  tuile: { marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  tuileLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  tuileValeur: { marginTop: 4, fontSize: 26, fontWeight: 'bold', color: '#0F172A' },
  tuileSousTexte: { marginTop: 6, fontSize: 12, color: '#94A3B8' },
  carte: { borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  inputMontant: { borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: '#0F172A' },
  boutonValider: { marginTop: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#4F46E5', paddingVertical: 14 },
  boutonValiderDesactive: { backgroundColor: '#E2E8F0' },
  boutonValiderTexte: { fontSize: 14, fontWeight: '700', color: 'white' },
  boutonValiderTexteDesactive: { color: '#94A3B8' },
  texteErreur: { marginTop: 10, fontSize: 12, color: '#DC2626' },
  ligneHistorique: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 12 },
  ligneHistoriqueMontant: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  ligneHistoriqueSousTexte: { marginTop: 2, fontSize: 11, color: '#94A3B8' },
  lienSupprimer: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
});
