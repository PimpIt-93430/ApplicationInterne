// Composant en StyleSheet (pas de className) : le sélecteur "Jour précis" utilise le picker de
// date natif, même contournement du bug NativeWind que PanneauAbsences.tsx/FinanceEcran.tsx (cf.
// leurs en-têtes) — un <input type="date"> natif sur web, DateTimePicker sur iOS/Android.
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { router, useLocalSearchParams } from 'expo-router';
import { createElement, useEffect, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useVentesEspecesPeriode } from '@/hooks/useVentesEspeces';
import { useSynchroniserVentesSumup, useVentesSumupPeriode } from '@/hooks/useVentesSumup';

type Periode = 'jour' | 'semaine' | 'mois' | 'annee' | 'jour_precis';

const PERIODES: { value: Periode; label: string }[] = [
  { value: 'jour', label: "Aujourd'hui" },
  { value: 'semaine', label: 'Semaine' },
  { value: 'mois', label: 'Mois' },
  { value: 'annee', label: 'Année' },
  { value: 'jour_precis', label: 'Jour précis' },
];

function calculerPeriode(periode: Periode, jourPrecis: Date): { debut: Date; fin: Date } {
  const maintenant = new Date();
  if (periode === 'semaine') {
    return { debut: startOfWeek(maintenant, { weekStartsOn: 1 }), fin: endOfWeek(maintenant, { weekStartsOn: 1 }) };
  }
  if (periode === 'mois') return { debut: startOfMonth(maintenant), fin: endOfMonth(maintenant) };
  if (periode === 'annee') return { debut: startOfYear(maintenant), fin: endOfYear(maintenant) };
  if (periode === 'jour_precis') return { debut: startOfDay(jourPrecis), fin: endOfDay(jourPrecis) };
  return { debut: startOfDay(maintenant), fin: endOfDay(maintenant) };
}

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function TuileChiffre({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View style={styles.tuile}>
      <Text style={styles.tuileLabel}>{label}</Text>
      <Text style={styles.tuileValeur}>{valeur}</Text>
    </View>
  );
}

/** Récap simple des chiffres SumUp + espèces (bouton "Voir tous les chiffres" depuis Ventes) :
 * jour/semaine/mois/année ou un jour précis choisi à la main — pas de filtres ni de graphique ici,
 * volontairement minimal (cf. discussion : trop de choses en même temps). L'écran Finance existant
 * reste disponible pour le détail (historique, répartitions, filtres) si besoin plus tard.
 *
 * Scopé au pop-up actif de l'écran Ventes (popUpId/popUpNom passés en param de route) : pour un
 * manager mono-pop-up la RLS suffisait déjà, mais un admin ou quelqu'un affecté à plusieurs pop-up
 * (cf. VentesEcran) voyait sinon toujours le cumul de tous les pop-up quel que soit celui
 * sélectionné avant de cliquer "Voir tous les chiffres" — cf. retour utilisateur du 2026-09-01. */
export function RecapVentesEcran() {
  const { popUpId, popUpNom } = useLocalSearchParams<{ popUpId?: string; popUpNom?: string }>();
  const [periode, setPeriode] = useState<Periode>('jour');
  const [jourPrecis, setJourPrecis] = useState(new Date());
  const [pickerOuvert, setPickerOuvert] = useState(false);

  const { debut, fin } = calculerPeriode(periode, jourPrecis);
  const { data: ventes, isLoading } = useVentesSumupPeriode(debut.toISOString(), fin.toISOString());
  const { data: ventesEspeces, isLoading: chargementEspeces } = useVentesEspecesPeriode(
    debut.toISOString(),
    fin.toISOString(),
  );
  const synchroniser = useSynchroniserVentesSumup();

  // Synchronise en arrivant sur l'écran, même principe que Finance — pour que "Aujourd'hui" reflète
  // bien les dernières ventes sans action supplémentaire.
  useEffect(() => {
    synchroniser.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choisirPeriode = (p: Periode) => {
    setPeriode(p);
    if (p === 'jour_precis' && Platform.OS !== 'web') setPickerOuvert(true);
  };

  const ventesReussies = (ventes ?? []).filter(
    (v) => v.statut === 'SUCCESSFUL' && (!popUpId || v.pop_up_id === popUpId),
  );
  const caTotal = ventesReussies.reduce((s, v) => s + v.montant, 0);
  const nbVentes = ventesReussies.length;
  const panierMoyen = nbVentes > 0 ? caTotal / nbVentes : 0;

  // Carte vs espèces "SumUp" : deux façons de payer en espèces coexistent — celles saisies à la
  // main dans l'écran Ventes (ventes_especes, "Espèce appli") et celles enregistrées comme telles
  // directement dans SumUp (moyen_paiement = CASH, jamais repassées par notre écran de déclaration
  // — d'où "Espèce SumUp"). Le reste (VISA/MASTERCARD/AMEX/MAESTRO...) est la carte.
  const caCarte = ventesReussies.filter((v) => v.moyen_paiement !== 'CASH').reduce((s, v) => s + v.montant, 0);
  const caEspecesNonDeclarees = ventesReussies
    .filter((v) => v.moyen_paiement === 'CASH')
    .reduce((s, v) => s + v.montant, 0);
  const caEspecesDeclarees = (ventesEspeces ?? [])
    .filter((v) => v.statut === 'confirmee' && (!popUpId || v.pop_up_id === popUpId))
    .reduce((s, v) => s + v.montant, 0);

  return (
    <View style={styles.ecran}>
      <EnteteRetour titre={popUpNom ? `Chiffres — ${popUpNom}` : 'Chiffres'} onRetour={() => router.back()} />

      <View style={styles.segment}>
        {PERIODES.map((p) => (
          <Pressable
            key={p.value}
            onPress={() => choisirPeriode(p.value)}
            style={[styles.segmentBouton, periode === p.value && styles.segmentBoutonActif]}
          >
            <Text style={periode === p.value ? styles.segmentTexteActif : styles.segmentTexte}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {periode === 'jour_precis' && (
        <View style={styles.dateChoisieLigne}>
          {Platform.OS === 'web' ? (
            createElement('input', {
              type: 'date',
              value: format(jourPrecis, 'yyyy-MM-dd'),
              onChange: (e: ChangeEvent<HTMLInputElement>) => {
                if (e.target.value) setJourPrecis(new Date(`${e.target.value}T00:00:00`));
              },
              style: styles.inputDateWeb as unknown as CSSProperties,
            })
          ) : (
            <Pressable onPress={() => setPickerOuvert(true)} style={styles.boutonDateNatif}>
              <Text style={styles.boutonDateNatifTexte}>
                {format(jourPrecis, 'EEEE d MMMM yyyy', { locale: fr })}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {pickerOuvert &&
        Platform.OS !== 'web' &&
        createElement(DateTimePicker, {
          value: jourPrecis,
          mode: 'date',
          maximumDate: new Date(),
          display: Platform.OS === 'ios' ? 'spinner' : 'default',
          onChange: (event: { type: string }, valeur?: Date) => {
            if (Platform.OS === 'android') setPickerOuvert(false);
            if (event.type === 'dismissed' || !valeur) return;
            setJourPrecis(valeur);
          },
        })}
      {Platform.OS === 'ios' && pickerOuvert && (
        <Pressable onPress={() => setPickerOuvert(false)} style={styles.boutonOk}>
          <Text style={styles.boutonOkTexte}>OK</Text>
        </Pressable>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => synchroniser.mutate(undefined)}
          disabled={synchroniser.isPending}
          style={styles.boutonSynchro}
        >
          <Text style={styles.boutonSynchroTexte}>
            {synchroniser.isPending ? 'Synchronisation…' : 'Synchroniser'}
          </Text>
        </Pressable>
        {synchroniser.isError && (
          <Text style={styles.texteErreur}>
            Échec de la synchro : {synchroniser.error instanceof Error ? synchroniser.error.message : 'erreur inconnue'}
          </Text>
        )}

        {isLoading || chargementEspeces ? (
          <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
        ) : (
          <>
            <View style={styles.tuilesRow}>
              <TuileChiffre label="CA total" valeur={formatMontant(caTotal)} />
              <TuileChiffre label="Nombre de ventes" valeur={String(nbVentes)} />
              <TuileChiffre label="Panier moyen" valeur={formatMontant(panierMoyen)} />
            </View>

            <Text style={styles.titreSection}>Répartition</Text>
            <View style={styles.tuilesRow}>
              <TuileChiffre label="Carte" valeur={formatMontant(caCarte)} />
              <TuileChiffre label="Espèce appli" valeur={formatMontant(caEspecesDeclarees)} />
              <TuileChiffre label="Espèce SumUp" valeur={formatMontant(caEspecesNonDeclarees)} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  segmentBouton: { flexGrow: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 10, backgroundColor: '#F1F5F9' },
  segmentBoutonActif: { backgroundColor: '#4F46E5' },
  segmentTexte: { fontSize: 13, fontWeight: '600', color: '#475569' },
  segmentTexteActif: { fontSize: 13, fontWeight: '600', color: 'white' },
  dateChoisieLigne: { paddingHorizontal: 16, paddingTop: 10 },
  inputDateWeb: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1E293B',
  },
  boutonDateNatif: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 10 },
  boutonDateNatifTexte: { fontSize: 13, fontWeight: '600', color: '#1E293B', textTransform: 'capitalize' },
  boutonOk: { alignItems: 'center', marginHorizontal: 16, marginTop: 4 },
  boutonOkTexte: { fontSize: 15, fontWeight: '700', color: '#4F46E5' },
  boutonSynchro: { alignSelf: 'flex-start', marginBottom: 12, borderRadius: 8, backgroundColor: '#4F46E5', paddingHorizontal: 12, paddingVertical: 6 },
  boutonSynchroTexte: { fontSize: 12, fontWeight: '600', color: 'white' },
  texteErreur: { marginBottom: 12, fontSize: 12, color: '#DC2626' },
  tuilesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tuile: { minWidth: 150, flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: 'white', padding: 16 },
  tuileLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
  tuileValeur: { marginTop: 4, fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
  titreSection: { marginBottom: 8, marginTop: 20, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#94A3B8' },
});
