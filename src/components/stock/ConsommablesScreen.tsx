import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { TYPES_CONSOMMABLES } from '@/api/consommables';
import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useCommandeActiveConsommables, useGererCommandeConsommables } from '@/hooks/useConsommables';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import type { TypeConsommable } from '@/types/database.types';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';

const LABEL_TYPE: Record<TypeConsommable, string> = Object.fromEntries(
  TYPES_CONSOMMABLES.map((t) => [t.valeur, t.label]),
) as Record<TypeConsommable, string>;

/** Consommables : liste fixe (pochons, sacs, scotch, enveloppes, sac poubelle, autre) à cocher —
 * même circuit que les commandes de pin's (demandée → envoyée → reçue), sans étape de pesée. Le
 * pop-up demande, le local marque "envoyée" une fois préparée, le pop-up confirme "reçue". */
export function ConsommablesScreen({
  onRetour,
  popUpId,
  onChangePopUpId,
}: {
  onRetour: () => void;
  // Contrôlé par StockAccueil (même sélecteur partagé qu'avec StockScreen) pour qu'un admin garde
  // le même lieu choisi en passant de "Pin's" à "Consommables".
  popUpId: string | undefined;
  onChangePopUpId: (id: string) => void;
}) {
  const profile = useProfilEffectif();
  const estAdmin = profile?.role === 'admin';

  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const popUps = useMemo(
    () => (estAdmin ? (popUpsTous ?? []) : profile ? popUpsAttribues(profile, mapAffectations, popUpsTous ?? []) : []),
    [estAdmin, profile, mapAffectations, popUpsTous],
  );

  const popUpLocal = useMemo(() => popUpsTous?.find((p) => p.est_local), [popUpsTous]);
  const estAuLocal = !!popUpLocal && !!profile && (mapAffectations.get(profile.id)?.has(popUpLocal.id) ?? false);
  const estLocal = estAdmin || estAuLocal;

  const popUpActif = popUpId ?? popUps[0]?.id;

  const { data: commandeActive, isLoading: chargementCommande } = useCommandeActiveConsommables(popUpActif);
  const { demander, marquerEnvoyee, marquerRecue, basculerLigne } = useGererCommandeConsommables(popUpActif);

  const [selection, setSelection] = useState<Set<TypeConsommable>>(new Set());
  const [descriptionAutre, setDescriptionAutre] = useState('');

  const toggleType = (type: TypeConsommable) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const envoyerDemande = () => {
    if (!profile || selection.size === 0) return;
    const lignes = [...selection].map((type) => ({
      type,
      description: type === 'autre' ? descriptionAutre.trim() || null : null,
    }));
    demander.mutate(
      { profileId: profile.id, lignes },
      {
        onSuccess: () => {
          setSelection(new Set());
          setDescriptionAutre('');
        },
        onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'envoyer."),
      },
    );
  };

  if (!profile) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Consommables" onRetour={onRetour} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Le choix du lieu se fait une seule fois en arrivant sur Stock (StockAccueil, sélecteur
            partagé entre catégories) — ici juste un rappel du lieu actif. */}
        <Text className="mb-5 text-xl font-bold text-slate-900">
          {popUps.find((p) => p.id === popUpActif)?.nom ?? '—'}
        </Text>

        {!popUpActif ? (
          <Text className="text-sm text-slate-400">
            Aucun lieu attribué pour l'instant — demande à un admin de t'en attribuer un.
          </Text>
        ) : chargementCommande ? (
          <ActivityIndicator color="#6366F1" />
        ) : !commandeActive ? (
          <>
            <Text className="mb-3 text-sm text-slate-400">
              Coche ce dont tu as besoin, puis envoie la demande au local.
            </Text>
            {TYPES_CONSOMMABLES.map((t) => {
              const coche = selection.has(t.valeur);
              return (
                <Pressable
                  key={t.valeur}
                  onPress={() => toggleType(t.valeur)}
                  className="mb-2 flex-row items-center justify-between rounded-xl bg-white p-3.5 shadow-sm"
                >
                  <Text className="text-sm font-semibold text-slate-800">{t.label}</Text>
                  <View
                    className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                      coche ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                    }`}
                  >
                    {coche && <Text className="text-xs font-bold text-white">✓</Text>}
                  </View>
                </Pressable>
              );
            })}
            {selection.has('autre') && (
              <TextInput
                value={descriptionAutre}
                onChangeText={setDescriptionAutre}
                placeholder="Précise ce dont tu as besoin..."
                className="mb-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              />
            )}
            <Pressable
              onPress={envoyerDemande}
              disabled={selection.size === 0 || demander.isPending}
              className={`mt-3 items-center rounded-xl py-3.5 ${
                selection.size === 0 ? 'bg-slate-200' : 'bg-emerald-500'
              }`}
            >
              <Text
                className={`text-base font-bold ${selection.size === 0 ? 'text-slate-500' : 'text-white'}`}
              >
                {demander.isPending ? 'Envoi…' : 'Envoyer la demande'}
              </Text>
            </Pressable>
          </>
        ) : commandeActive.commande.statut === 'demandee' && !estLocal ? (
          <>
            <Text className="mb-3 text-sm text-slate-400">
              Demande en cours, modifiable tant que le local ne l'a pas prise en charge. Coche/décoche
              pour ajuster — chaque changement est enregistré tout de suite.
            </Text>
            {TYPES_CONSOMMABLES.map((t) => {
              const ligneExistante = commandeActive.lignes.find((l) => l.type === t.valeur);
              const coche = !!ligneExistante;
              return (
                <View key={t.valeur} className="mb-2">
                  <Pressable
                    onPress={() =>
                      basculerLigne.mutate(
                        {
                          commandeId: commandeActive.commande.id,
                          type: t.valeur,
                          description: t.valeur === 'autre' ? descriptionAutre.trim() || null : null,
                          inclus: !coche,
                        },
                        {
                          onError: (e) =>
                            Alert.alert(
                              'Erreur',
                              e instanceof Error ? e.message : "Impossible d'enregistrer.",
                            ),
                        },
                      )
                    }
                    className="flex-row items-center justify-between rounded-xl bg-white p-3.5 shadow-sm"
                  >
                    <Text className="text-sm font-semibold text-slate-800">
                      {t.label}
                      {t.valeur === 'autre' && !!ligneExistante?.description
                        ? ` — ${ligneExistante.description}`
                        : ''}
                    </Text>
                    <View
                      className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                        coche ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                      }`}
                    >
                      {coche && <Text className="text-xs font-bold text-white">✓</Text>}
                    </View>
                  </Pressable>
                  {t.valeur === 'autre' && !coche && (
                    <TextInput
                      value={descriptionAutre}
                      onChangeText={setDescriptionAutre}
                      placeholder="Précise ce dont tu as besoin, puis coche..."
                      className="mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    />
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Text className="mb-3 text-xs font-semibold uppercase text-slate-400">Demande en cours</Text>
            {commandeActive.lignes.map((ligne) => (
              <View key={ligne.id} className="mb-2 rounded-xl bg-white p-3.5 shadow-sm">
                <Text className="text-sm font-semibold text-slate-800">{LABEL_TYPE[ligne.type]}</Text>
                {!!ligne.description && (
                  <Text className="mt-0.5 text-xs text-slate-400">{ligne.description}</Text>
                )}
              </View>
            ))}

            <View className="mt-4">
              {commandeActive.commande.statut === 'demandee' ? (
                // Ici forcément estLocal : le cas "pop-up + demandee" est géré par la branche
                // éditable ci-dessus.
                <Pressable
                  onPress={() =>
                    marquerEnvoyee.mutate(
                      { commandeId: commandeActive.commande.id, profileId: profile.id },
                      {
                        onError: (e) =>
                          Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de valider.'),
                      },
                    )
                  }
                  className="items-center rounded-xl bg-indigo-600 py-3.5"
                >
                  <Text className="text-base font-bold text-white">
                    {marquerEnvoyee.isPending ? 'Validation…' : 'Marquer comme envoyée'}
                  </Text>
                </Pressable>
              ) : estLocal ? (
                <View className="items-center rounded-xl bg-amber-100 py-3.5">
                  <Text className="text-sm font-semibold text-amber-700">
                    Envoyée — en attente de confirmation
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Commande reçue',
                      'Confirmer que tu as bien récupéré ces consommables ?',
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Confirmer',
                          onPress: () =>
                            marquerRecue.mutate(
                              { commandeId: commandeActive.commande.id, profileId: profile.id },
                              {
                                onError: (e) =>
                                  Alert.alert(
                                    'Erreur',
                                    e instanceof Error ? e.message : 'Impossible de valider.',
                                  ),
                              },
                            ),
                        },
                      ],
                    )
                  }
                  className="items-center rounded-xl bg-emerald-600 py-3.5"
                >
                  <Text className="text-base font-bold text-white">
                    {marquerRecue.isPending ? 'Validation…' : 'Commande reçue ?'}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
