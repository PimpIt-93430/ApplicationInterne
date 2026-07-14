import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { useChaussuresStock, useGererChaussures } from '@/hooks/useChaussures';
import type { ChaussureStock } from '@/types/database.types';

const COULEURS: ChaussureStock['couleur'][] = ['Noir', 'Kaki', 'Rose', 'Gris'];

function CelluleQuantite({ item, onDefinir }: { item: ChaussureStock; onDefinir: (quantite: number) => void }) {
  const [valeur, setValeur] = useState(item.quantite_a_ramener > 0 ? String(item.quantite_a_ramener) : '');
  const [focus, setFocus] = useState(false);

  // Reprend la valeur du serveur (ex. modifiée par quelqu'un d'autre) sauf pendant que la
  // personne est justement en train de taper, pour ne pas lui couper la saisie.
  useEffect(() => {
    if (focus) return;
    setValeur(item.quantite_a_ramener > 0 ? String(item.quantite_a_ramener) : '');
  }, [item.quantite_a_ramener, focus]);

  const enregistrer = () => {
    const n = valeur.trim() === '' ? 0 : Number(valeur);
    if (!Number.isFinite(n) || n < 0) return;
    if (n !== item.quantite_a_ramener) onDefinir(n);
  };

  return (
    <View className="items-center">
      <Text className="mb-1 text-[11px] font-semibold text-slate-400">{item.taille}</Text>
      <TextInput
        value={valeur}
        onChangeText={setValeur}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          enregistrer();
        }}
        onSubmitEditing={enregistrer}
        keyboardType="number-pad"
        placeholder="0"
        className={`h-11 w-14 rounded-lg border text-center text-sm font-semibold ${
          item.quantite_a_ramener > 0
            ? 'border-amber-300 bg-amber-50 text-amber-700'
            : 'border-slate-200 bg-white text-slate-700'
        }`}
      />
    </View>
  );
}

function CarteCouleur({
  couleur,
  items,
  onDefinir,
}: {
  couleur: string;
  items: ChaussureStock[];
  onDefinir: (id: string, quantite: number) => void;
}) {
  return (
    <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
      <Text className="mb-3 text-base font-bold text-slate-900">{couleur}</Text>
      <View className="flex-row flex-wrap gap-3">
        {items.map((item) => (
          <CelluleQuantite key={item.id} item={item} onDefinir={(q) => onDefinir(item.id, q)} />
        ))}
      </View>
    </View>
  );
}

export function ChaussuresScreen({ onRetour }: { onRetour: () => void }) {
  const { data: items, isLoading } = useChaussuresStock();
  const { definirQuantite, validerReappro } = useGererChaussures();
  const [onglet, setOnglet] = useState<'stock' | 'reappro'>('stock');

  const parCouleur = useMemo(() => {
    const map = new Map<string, ChaussureStock[]>();
    for (const item of items ?? []) {
      const liste = map.get(item.couleur) ?? [];
      liste.push(item);
      map.set(item.couleur, liste);
    }
    return map;
  }, [items]);

  const aRamener = (items ?? []).filter((i) => i.quantite_a_ramener > 0);

  const confirmerValidation = () => {
    Alert.alert(
      'Valider le réapprovisionnement',
      'Une fois ramené, ça remet toutes les quantités à 0. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Valider', style: 'destructive', onPress: () => validerReappro.mutate() },
      ],
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Chaussures" onRetour={onRetour} />

      <View className="flex-row gap-2 px-4 pt-2">
        <Pressable
          onPress={() => setOnglet('stock')}
          className={`flex-1 items-center rounded-lg py-2.5 ${onglet === 'stock' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={onglet === 'stock' ? 'font-semibold text-white' : 'text-slate-600'}>Stock</Text>
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

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {onglet === 'stock' ? (
            <>
              <Text className="mb-3 text-xs text-slate-400">
                Écris combien de paires ramener, par couleur et par taille.
              </Text>
              {COULEURS.map((couleur) => (
                <CarteCouleur
                  key={couleur}
                  couleur={couleur}
                  items={parCouleur.get(couleur) ?? []}
                  onDefinir={(id, q) => definirQuantite.mutate({ id, quantite: q })}
                />
              ))}
            </>
          ) : (
            <>
              {aRamener.length === 0 ? (
                <Text className="text-sm text-slate-400">Rien à ramener pour l'instant.</Text>
              ) : (
                aRamener.map((item) => (
                  <View
                    key={item.id}
                    className="mb-1.5 flex-row items-center justify-between rounded-lg bg-amber-50 px-3 py-2.5"
                  >
                    <Text className="text-sm text-slate-700">
                      {item.couleur} — {item.taille}
                    </Text>
                    <Text className="text-sm font-bold text-amber-700">{item.quantite_a_ramener}</Text>
                  </View>
                ))
              )}
              <Pressable
                onPress={confirmerValidation}
                disabled={validerReappro.isPending || aRamener.length === 0}
                className={`mt-4 items-center rounded-xl py-3.5 ${
                  aRamener.length === 0 ? 'bg-slate-200' : 'bg-emerald-500'
                }`}
              >
                <Text className={`text-base font-bold ${aRamener.length === 0 ? 'text-slate-500' : 'text-white'}`}>
                  {validerReappro.isPending ? 'Validation…' : 'Valider le réapprovisionnement'}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
