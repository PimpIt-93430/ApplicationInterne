import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { Dropdown } from '@/components/ui/Dropdown';
import {
  useChaussuresStock,
  useGererChaussures,
  useGererMappingSumup,
  useMappingSumupChaussures,
  useNomsProduitsSumupNonMappes,
} from '@/hooks/useChaussures';
import type { ChaussureMappingSumup, ChaussureStock } from '@/types/database.types';

const COULEURS: ChaussureStock['couleur'][] = ['Noir', 'Kaki', 'Rose', 'Gris'];
const TAILLES: ChaussureStock['taille'][] = ['36-37', '38-39', '40-41', '41-42', '43-44', '45-46'];

/** Une cellule éditable qui s'enregistre elle-même en quittant le focus. */
function CelluleStockInitial({ item, onDefinir }: { item: ChaussureStock; onDefinir: (quantite: number) => void }) {
  const [valeur, setValeur] = useState(item.stock_initial > 0 ? String(item.stock_initial) : '');
  const [focus, setFocus] = useState(false);

  // Reprend la valeur du serveur (ex. modifiée par quelqu'un d'autre) sauf pendant que la
  // personne est justement en train de taper, pour ne pas lui couper la saisie.
  useEffect(() => {
    if (focus) return;
    setValeur(item.stock_initial > 0 ? String(item.stock_initial) : '');
  }, [item.stock_initial, focus]);

  const enregistrer = () => {
    const n = valeur.trim() === '' ? 0 : Number(valeur);
    if (!Number.isFinite(n) || n < 0) return;
    if (n !== item.stock_initial) onDefinir(n);
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
          item.stock_initial > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'
        }`}
      />
    </View>
  );
}

function OngletStockCible() {
  const { data: stock, isLoading } = useChaussuresStock();
  const { definirStock } = useGererChaussures(undefined);

  const parCouleur = new Map<string, ChaussureStock[]>();
  for (const item of stock ?? []) {
    const liste = parCouleur.get(item.couleur) ?? [];
    liste.push(item);
    parCouleur.set(item.couleur, liste);
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text className="mb-3 text-xs text-slate-400">
        Le stock visé par couleur et par taille, commun à tous les pop-ups — sert de référence pour
        calculer ce qu'il faut ramener après un inventaire (écran Stock &gt; Chaussures).
      </Text>
      {COULEURS.map((couleur) => (
        <View key={couleur} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="mb-3 text-base font-bold text-slate-900">{couleur}</Text>
          <View className="flex-row flex-wrap gap-3">
            {(parCouleur.get(couleur) ?? []).map((item) => (
              <CelluleStockInitial
                key={item.id}
                item={item}
                onDefinir={(q) => definirStock.mutate({ id: item.id, quantite: q })}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** Une ligne "à mapper" : nom SumUp vu dans des ventes, pas encore associé — deux menus déroulants
 * puis "Associer", rien n'est enregistré avant. */
function LigneAMapper({
  nomProduit,
  onAssocier,
}: {
  nomProduit: string;
  onAssocier: (couleur: ChaussureMappingSumup['couleur'], taille: ChaussureMappingSumup['taille']) => void;
}) {
  const [couleur, setCouleur] = useState<ChaussureMappingSumup['couleur'] | undefined>(undefined);
  const [taille, setTaille] = useState<ChaussureMappingSumup['taille'] | undefined>(undefined);

  return (
    <View className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <Text className="mb-2 text-sm font-semibold text-slate-800">{nomProduit}</Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Dropdown
            value={couleur}
            options={COULEURS.map((c) => ({ value: c, label: c }))}
            onChange={(v) => setCouleur(v as ChaussureMappingSumup['couleur'])}
            placeholder="Couleur"
          />
        </View>
        <View className="flex-1">
          <Dropdown
            value={taille}
            options={TAILLES.map((t) => ({ value: t, label: t }))}
            onChange={(v) => setTaille(v as ChaussureMappingSumup['taille'])}
            placeholder="Taille"
          />
        </View>
      </View>
      <Pressable
        onPress={() => couleur && taille && onAssocier(couleur, taille)}
        disabled={!couleur || !taille}
        className={`mt-2 items-center rounded-lg py-2 ${couleur && taille ? 'bg-indigo-600' : 'bg-slate-200'}`}
      >
        <Text className={`text-sm font-semibold ${couleur && taille ? 'text-white' : 'text-slate-500'}`}>
          Associer
        </Text>
      </Pressable>
    </View>
  );
}

function OngletMappingSumup() {
  const { data: nomsNonMappes, isLoading: chargementNonMappes } = useNomsProduitsSumupNonMappes();
  const { data: mapping, isLoading: chargementMapping } = useMappingSumupChaussures();
  const { definirMapping, supprimerMapping } = useGererMappingSumup();

  if (chargementNonMappes || chargementMapping) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text className="mb-3 text-xs text-slate-400">
        Associe chaque nom de produit du catalogue SumUp à une couleur/taille : ça permet au
        Réapprovisionnement de déduire automatiquement les ventes depuis le dernier inventaire, sans
        attendre un recomptage.
      </Text>

      {(nomsNonMappes ?? []).length > 0 && (
        <>
          <Text className="mb-2 text-xs font-semibold uppercase text-amber-600">À associer</Text>
          {(nomsNonMappes ?? []).map((nom) => (
            <LigneAMapper
              key={nom}
              nomProduit={nom}
              onAssocier={(couleur, taille) => definirMapping.mutate({ nomProduit: nom, couleur, taille })}
            />
          ))}
        </>
      )}

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-400">Déjà associés</Text>
      {(mapping ?? []).length === 0 ? (
        <Text className="text-sm text-slate-400">Aucune correspondance pour l'instant.</Text>
      ) : (
        (mapping ?? []).map((m) => (
          <View
            key={m.id}
            className="mb-1.5 flex-row items-center justify-between rounded-lg bg-white p-3 shadow-sm"
          >
            <View>
              <Text className="text-sm font-semibold text-slate-800">{m.nom_produit}</Text>
              <Text className="text-xs text-slate-400">
                {m.couleur} — {m.taille}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                Alert.alert('Retirer la correspondance', `"${m.nom_produit}" ne sera plus rapproché du stock.`, [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Retirer', style: 'destructive', onPress: () => supprimerMapping.mutate(m.id) },
                ])
              }
            >
              <Text className="text-sm font-semibold text-red-500">Retirer</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

/** Réglages chaussures : stock cible (un seul jeu de valeurs par couleur/taille, partagé par tous
 * les pop-ups — décision explicite, pas de version par lieu) et correspondance SumUp (pour que le
 * réappro déduise les ventes automatiquement). Volontairement isolé de l'écran Stock > Produits >
 * Chaussures (qui reste, lui, propre à chaque pop-up pour l'inventaire et le réappro), et
 * volontairement web uniquement (cf. route stock-cible.web.tsx), pas besoin sur le téléphone. */
export function StockCibleEcran() {
  const [onglet, setOnglet] = useState<'stock' | 'mapping'>('stock');

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Stock cible" />
      <View className="flex-row gap-2 px-4 pt-2">
        <Pressable
          onPress={() => setOnglet('stock')}
          className={`flex-1 items-center rounded-lg py-2.5 ${onglet === 'stock' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={onglet === 'stock' ? 'font-semibold text-white' : 'text-slate-600'}>Stock cible</Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('mapping')}
          className={`flex-1 items-center rounded-lg py-2.5 ${onglet === 'mapping' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={onglet === 'mapping' ? 'font-semibold text-white' : 'text-slate-600'}>
            Correspondance SumUp
          </Text>
        </Pressable>
      </View>
      {onglet === 'stock' ? <OngletStockCible /> : <OngletMappingSumup />}
    </View>
  );
}
