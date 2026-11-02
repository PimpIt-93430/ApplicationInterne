import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { TYPES_CONSOMMABLES } from '@/api/consommables';
import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { usePopUps } from '@/hooks/usePopUps';
import { useGererSaisiesCommande, useSaisiesCommande } from '@/hooks/useSaisiesCommande';
import type { Profile, StockSaisieCommande, TypeConsommable } from '@/types/database.types';

/** Consommables, dernière case de la colonne Stock : on coche ce qu'il faut (ou rien) et on valide
 * pour passer au vert — la demande part ensuite avec le reste via "Envoyer la commande". */
export function SaisieConsommablesScreen({
  popUpId,
  profile,
  onRetour,
}: {
  popUpId: string | undefined;
  profile: Profile;
  onRetour: () => void;
}) {
  const { data: popUps } = usePopUps();
  const { data: saisies, isLoading } = useSaisiesCommande(popUpId);

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Consommables" onRetour={onRetour} />
      <Text className="px-4 pt-2 text-sm font-semibold text-slate-500">{popUps?.find((p) => p.id === popUpId)?.nom ?? '—'}</Text>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : (
        <FormulaireConsommables
          popUpId={popUpId}
          profile={profile}
          saisieInitiale={saisies?.find((s) => s.categorie === 'consommables')}
          onValide={onRetour}
        />
      )}
    </View>
  );
}

/** Monté une fois les données chargées, avec la saisie déjà validée comme état initial. */
function FormulaireConsommables({
  popUpId,
  profile,
  saisieInitiale,
  onValide,
}: {
  popUpId: string | undefined;
  profile: Profile;
  saisieInitiale: StockSaisieCommande | undefined;
  onValide: () => void;
}) {
  const { valider, supprimer } = useGererSaisiesCommande(popUpId);
  const [selection, setSelection] = useState<Set<TypeConsommable>>(
    () => new Set(Object.keys(saisieInitiale?.quantites ?? {}) as TypeConsommable[]),
  );
  const [descriptionAutre, setDescriptionAutre] = useState(saisieInitiale?.description_autre ?? '');

  const basculer = (type: TypeConsommable) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const enregistrer = () => {
    if (!popUpId) return;
    valider.mutate(
      {
        categorie: 'consommables',
        quantites: Object.fromEntries([...selection].map((t) => [t, 1])),
        descriptionAutre: selection.has('autre') ? descriptionAutre.trim() || null : null,
        profileId: profile.id,
      },
      {
        onSuccess: onValide,
        onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer."),
      },
    );
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 960, width: '100%', alignSelf: 'center' }}>
      <Text className="mb-3 text-xs text-slate-400">Coche ce qu&apos;il te faut, puis valide (même si tu n&apos;as besoin de rien).</Text>
      {TYPES_CONSOMMABLES.map((t) => {
        const coche = selection.has(t.valeur);
        return (
          <Pressable
            key={t.valeur}
            onPress={() => basculer(t.valeur)}
            className="mb-1.5 flex-row items-center justify-between rounded-xl bg-white p-3.5 shadow-sm"
          >
            <Text className="text-sm font-semibold text-slate-800">{t.label}</Text>
            <View className={`h-6 w-6 items-center justify-center rounded-md border-2 ${coche ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
              {coche && <Text className="text-xs font-bold text-white">✓</Text>}
            </View>
          </Pressable>
        );
      })}
      {selection.has('autre') && (
        <TextInput
          value={descriptionAutre}
          onChangeText={setDescriptionAutre}
          placeholder="Précise ce qu'il te faut"
          className="mb-2 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"
        />
      )}
      <Pressable
        onPress={enregistrer}
        disabled={valider.isPending || !popUpId}
        className="mt-3 items-center rounded-xl bg-emerald-500 py-3.5"
      >
        <Text className="text-base font-bold text-white">
          {valider.isPending ? 'Enregistrement…' : selection.size > 0 ? `Valider (${selection.size})` : 'Valider — rien à commander'}
        </Text>
      </Pressable>
      {/* Retour utilisateur du 2026-10-26 : pouvoir remettre la case "à faire" après coup. */}
      {!!saisieInitiale && (
        <Pressable
          onPress={() =>
            supprimer.mutate(['consommables'], {
              onSuccess: onValide,
              onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de dévalider.'),
            })
          }
          disabled={supprimer.isPending}
          className="mt-2 items-center rounded-xl border border-slate-300 bg-white py-3"
        >
          <Text className="text-sm font-semibold text-slate-600">{supprimer.isPending ? 'Annulation…' : 'Dévalider'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
