import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useCoquesInventaires, useCoquesStock, useGererCoques, useMappingSumupCoques } from '@/hooks/useCoques';
import { useVentesSumupLignes } from '@/hooks/useChaussures';
import { usePopUps } from '@/hooks/usePopUps';
import { useAuthStore } from '@/store/useAuthStore';
import { useSynchroniserVentesSumup } from '@/hooks/useVentesSumup';
import { calculerARamenerCoques, resoudreVentesSumupCoques } from '@/utils/coques';
import type { CoqueStock } from '@/types/database.types';

const MODELES: CoqueStock['modele'][] = ['Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17'];
const VARIANTES: CoqueStock['variante'][] = ['Normal', 'Pro', 'Pro Max', 'Plus'];
const COULEURS: CoqueStock['couleur'][] = ['Rose', 'Noir'];

/** Une cellule éditable qui garde sa valeur dans l'état partagé du parent (écran Inventaire) —
 * rien n'est enregistré tant que "Valider l'inventaire" n'a pas été pressé. Même composant que
 * ChaussuresScreen (CelluleComptage), dupliqué ici plutôt que partagé : différence de libellé
 * (couleur, pas taille) trop mineure pour justifier un import croisé entre écrans indépendants. */
function CelluleComptage({
  couleur,
  valeur,
  onChange,
}: {
  couleur: string;
  valeur: string;
  onChange: (texte: string) => void;
}) {
  return (
    <View className="items-center">
      <Text className="mb-1 text-[11px] font-semibold text-slate-400">{couleur}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="0"
        className={`h-11 w-14 rounded-lg border text-center text-sm font-semibold ${
          valeur.trim() !== '' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'
        }`}
      />
    </View>
  );
}

export function CoquesScreen({
  onRetour,
  popUpId,
}: {
  onRetour: () => void;
  // Contrôlé par StockAccueil (même sélecteur partagé qu'avec Chaussures/Pin's/Consommables).
  popUpId: string | undefined;
}) {
  const { data: popUps } = usePopUps();
  const { data: stock, isLoading: chargementStock } = useCoquesStock();
  const { data: inventaires, isLoading: chargementInventaires } = useCoquesInventaires(popUpId);
  const { data: ventesLignes } = useVentesSumupLignes(popUpId);
  const { data: mappingSumup } = useMappingSumupCoques();
  const { validerInventaire } = useGererCoques(popUpId);
  const profileId = useAuthStore((s) => s.profile?.id);
  const [onglet, setOnglet] = useState<'inventaire' | 'reappro'>('inventaire');
  const [comptage, setComptage] = useState<Record<string, string>>({});
  const [modeEdition, setModeEdition] = useState(false);

  // Resynchronise les ventes SumUp à chaque ouverture de l'écran — même principe que
  // ChaussuresScreen.
  const synchroniser = useSynchroniserVentesSumup();
  const [derniereSynchro, setDerniereSynchro] = useState<Date | null>(null);
  useEffect(() => {
    synchroniser.mutate(undefined, { onSuccess: () => setDerniereSynchro(new Date()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ventes = useMemo(
    () => resoudreVentesSumupCoques(ventesLignes ?? [], mappingSumup ?? []),
    [ventesLignes, mappingSumup],
  );
  const avecARamener = useMemo(
    () => calculerARamenerCoques(stock ?? [], inventaires ?? [], ventes),
    [stock, inventaires, ventes],
  );

  const parModele = useMemo(() => {
    const map = new Map<string, CoqueStock[]>();
    for (const item of stock ?? []) {
      const liste = map.get(item.modele) ?? [];
      liste.push(item);
      map.set(item.modele, liste);
    }
    return map;
  }, [stock]);

  const aRamener = avecARamener.filter((i) => i.aRamener > 0);
  const chargement = chargementStock || (!!popUpId && chargementInventaires);

  const validerLInventaire = () => {
    if (!profileId || !stock || !popUpId) return;
    const lignes = stock.map((item) => ({
      modele: item.modele,
      variante: item.variante,
      couleur: item.couleur,
      quantite_comptee: Number(comptage[item.id]) || 0,
    }));
    Alert.alert(
      "Valider l'inventaire",
      "Enregistre ce comptage — ça recalcule directement ce qu'il faut ramener.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: () =>
            validerInventaire.mutate(
              { lignes, profileId },
              {
                onSuccess: () => {
                  setComptage({});
                  setModeEdition(false);
                },
              },
            ),
        },
      ],
    );
  };

  // Reprend le stock estimé affiché (pas le dernier comptage brut) — cf. ChaussuresScreen.
  const modifierInventaire = () => {
    const nouveauComptage: Record<string, string> = {};
    for (const item of avecARamener) {
      if (item.stockEstime !== null) nouveauComptage[item.id] = String(item.stockEstime);
    }
    setComptage(nouveauComptage);
    setModeEdition(true);
  };

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Coques" onRetour={onRetour} />

      <Text className="px-4 pt-2 text-sm font-semibold text-slate-500">
        {popUps?.find((p) => p.id === popUpId)?.nom ?? '—'}
      </Text>
      <Text className="px-4 pt-0.5 text-xs text-slate-400">
        {synchroniser.isPending
          ? 'Synchronisation des ventes SumUp…'
          : synchroniser.isError
            ? `Échec de la synchro : ${synchroniser.error instanceof Error ? synchroniser.error.message : 'erreur inconnue'}`
            : derniereSynchro
              ? `Dernière synchro le ${format(derniereSynchro, 'dd/MM/yyyy à HH:mm', { locale: fr })}`
              : ''}
      </Text>

      <View className="flex-row gap-2 px-4 pt-2">
        <Pressable
          onPress={() => setOnglet('inventaire')}
          className={`flex-1 items-center rounded-lg py-2.5 ${onglet === 'inventaire' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={onglet === 'inventaire' ? 'font-semibold text-white' : 'text-slate-600'}>Inventaire</Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('reappro')}
          className={`flex-1 items-center rounded-lg py-2.5 ${onglet === 'reappro' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={onglet === 'reappro' ? 'font-semibold text-white' : 'text-slate-600'}>
            Réapprovisionnement
          </Text>
        </Pressable>
      </View>

      {chargement ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {!popUpId && (
            <Text className="text-sm text-slate-400">
              Aucun lieu attribué pour l'instant — demande à un admin de t'en attribuer un.
            </Text>
          )}

          {onglet === 'inventaire' && !!popUpId && !modeEdition && (
            <>
              <Text className="mb-3 text-xs text-slate-400">
                Stock estimé en temps réel, par modèle/variante/couleur — dernier comptage moins les
                ventes SumUp survenues depuis (bouge à chaque vente). "—" si aucun inventaire n'a
                encore été fait pour cette case. Refais un inventaire de temps en temps pour recaler
                sur le vrai compte.
              </Text>
              {MODELES.map((modele) => (
                <View key={modele} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <Text className="mb-3 text-base font-bold text-slate-900">{modele}</Text>
                  {VARIANTES.map((variante) => (
                    <View key={variante} className="mb-3">
                      <Text className="mb-1.5 text-xs font-semibold text-slate-500">{variante}</Text>
                      <View className="flex-row flex-wrap gap-3">
                        {avecARamener
                          .filter((item) => item.modele === modele && item.variante === variante)
                          .map((item) => (
                            <View key={item.id} className="items-center">
                              <Text className="mb-1 text-[11px] font-semibold text-slate-400">{item.couleur}</Text>
                              <View className="h-11 w-14 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                                <Text className="text-sm font-semibold text-slate-700">
                                  {item.stockEstime !== null ? item.stockEstime : '—'}
                                </Text>
                              </View>
                            </View>
                          ))}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              <Pressable
                onPress={modifierInventaire}
                className="mt-2 items-center rounded-xl bg-slate-900 py-3.5"
              >
                <Text className="text-base font-bold text-white">Modifier l'inventaire</Text>
              </Pressable>
            </>
          )}

          {onglet === 'inventaire' && !!popUpId && modeEdition && (
            <>
              <Text className="mb-3 text-xs text-slate-400">
                Compte ce qu'il reste vraiment, par modèle/variante/couleur, puis valide — ça
                remplace le calcul de ce qu'il faut ramener.
              </Text>
              {MODELES.map((modele) => (
                <View key={modele} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <Text className="mb-3 text-base font-bold text-slate-900">{modele}</Text>
                  {VARIANTES.map((variante) => (
                    <View key={variante} className="mb-3">
                      <Text className="mb-1.5 text-xs font-semibold text-slate-500">{variante}</Text>
                      <View className="flex-row flex-wrap gap-3">
                        {(parModele.get(modele) ?? [])
                          .filter((item) => item.variante === variante)
                          .map((item) => (
                            <CelluleComptage
                              key={item.id}
                              couleur={item.couleur}
                              valeur={comptage[item.id] ?? ''}
                              onChange={(texte) => setComptage((prev) => ({ ...prev, [item.id]: texte }))}
                            />
                          ))}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
              <Pressable
                onPress={validerLInventaire}
                disabled={validerInventaire.isPending}
                className="mt-2 items-center rounded-xl bg-emerald-500 py-3.5"
              >
                <Text className="text-base font-bold text-white">
                  {validerInventaire.isPending ? 'Enregistrement…' : "Valider l'inventaire"}
                </Text>
              </Pressable>
              <Pressable onPress={() => setModeEdition(false)} className="mt-2 items-center py-2">
                <Text className="text-sm font-semibold text-slate-400">Annuler</Text>
              </Pressable>
            </>
          )}

          {onglet === 'reappro' && !!popUpId && (
            <>
              {aRamener.length === 0 ? (
                <Text className="text-sm text-slate-400">
                  Rien à ramener pour l'instant — ou aucun inventaire n'a encore été fait.
                </Text>
              ) : (
                aRamener.map((item) => (
                  <View
                    key={item.id}
                    className="mb-1.5 flex-row items-center justify-between rounded-lg bg-amber-50 px-3 py-2.5"
                  >
                    <View>
                      <Text className="text-sm text-slate-700">
                        {item.modele} — {item.variante} — {item.couleur}
                      </Text>
                      {item.venduDepuisInventaire > 0 && (
                        <Text className="text-xs text-slate-400">
                          dont {item.venduDepuisInventaire} vendue{item.venduDepuisInventaire > 1 ? 's' : ''} sur SumUp
                          depuis le dernier inventaire
                        </Text>
                      )}
                    </View>
                    <Text className="text-sm font-bold text-amber-700">{item.aRamener}</Text>
                  </View>
                ))
              )}
              <Text className="mt-4 text-xs text-slate-400">
                Calculé à partir du stock visé, du dernier inventaire et des ventes SumUp survenues
                depuis — fais un nouvel inventaire pour repartir d'un comptage à jour.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
