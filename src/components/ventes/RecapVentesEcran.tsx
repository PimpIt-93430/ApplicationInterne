import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useSynchroniserVentesSumup, useVentesSumupPeriode } from '@/hooks/useVentesSumup';

type Periode = 'jour' | 'semaine' | 'mois' | 'annee';

const PERIODES: { value: Periode; label: string }[] = [
  { value: 'jour', label: 'Jour' },
  { value: 'semaine', label: 'Semaine' },
  { value: 'mois', label: 'Mois' },
  { value: 'annee', label: 'Année' },
];

function calculerPeriode(periode: Periode): { debut: Date; fin: Date } {
  const maintenant = new Date();
  if (periode === 'semaine') {
    return { debut: startOfWeek(maintenant, { weekStartsOn: 1 }), fin: endOfWeek(maintenant, { weekStartsOn: 1 }) };
  }
  if (periode === 'mois') return { debut: startOfMonth(maintenant), fin: endOfMonth(maintenant) };
  if (periode === 'annee') return { debut: startOfYear(maintenant), fin: endOfYear(maintenant) };
  return { debut: startOfDay(maintenant), fin: endOfDay(maintenant) };
}

function formatMontant(montant: number): string {
  return montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function TuileChiffre({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View className="min-w-[150px] flex-1 rounded-2xl border border-slate-200 bg-white p-4">
      <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="mt-1 text-2xl font-bold text-slate-900">{valeur}</Text>
    </View>
  );
}

/** Récap simple des chiffres SumUp (bouton "Voir tous les chiffres" depuis Ventes) : jour/semaine/
 * mois/année, quelques totaux — pas de filtres ni de graphique ici, volontairement minimal (cf.
 * discussion : trop de choses en même temps). L'écran Finance existant reste disponible pour le
 * détail (historique, répartitions, filtres) si besoin plus tard. */
export function RecapVentesEcran() {
  const [periode, setPeriode] = useState<Periode>('jour');
  const { debut, fin } = calculerPeriode(periode);
  const { data: ventes, isLoading } = useVentesSumupPeriode(debut.toISOString(), fin.toISOString());
  const synchroniser = useSynchroniserVentesSumup();

  // Synchronise en arrivant sur l'écran, même principe que Finance — pour que "Jour" reflète bien
  // les dernières ventes sans action supplémentaire.
  useEffect(() => {
    synchroniser.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ventesReussies = (ventes ?? []).filter((v) => v.statut === 'SUCCESSFUL');
  const caTotal = ventesReussies.reduce((s, v) => s + v.montant, 0);
  const nbVentes = ventesReussies.length;
  const panierMoyen = nbVentes > 0 ? caTotal / nbVentes : 0;

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Chiffres" onRetour={() => router.back()} />

      <View className="flex-row gap-2 px-4 pt-2">
        {PERIODES.map((p) => (
          <Pressable
            key={p.value}
            onPress={() => setPeriode(p.value)}
            className={`flex-1 items-center rounded-lg py-2.5 ${periode === p.value ? 'bg-indigo-600' : 'bg-slate-100'}`}
          >
            <Text className={periode === p.value ? 'font-semibold text-white' : 'text-slate-600'}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Pressable
          onPress={() => synchroniser.mutate(undefined)}
          disabled={synchroniser.isPending}
          className="mb-3 self-start rounded-lg bg-indigo-600 px-3 py-1.5"
        >
          <Text className="text-xs font-semibold text-white">
            {synchroniser.isPending ? 'Synchronisation…' : 'Synchroniser'}
          </Text>
        </Pressable>
        {synchroniser.isError && (
          <Text className="mb-3 text-xs text-red-500">
            Échec de la synchro : {synchroniser.error instanceof Error ? synchroniser.error.message : 'erreur inconnue'}
          </Text>
        )}

        {isLoading ? (
          <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />
        ) : (
          <View className="flex-row flex-wrap gap-3">
            <TuileChiffre label="CA total" valeur={formatMontant(caTotal)} />
            <TuileChiffre label="Nombre de ventes" valeur={String(nbVentes)} />
            <TuileChiffre label="Panier moyen" valeur={formatMontant(panierMoyen)} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
