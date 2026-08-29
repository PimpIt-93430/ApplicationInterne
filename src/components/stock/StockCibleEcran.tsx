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
import {
  useCoquesStock,
  useGererCoques,
  useGererMappingSumupCoques,
  useMappingSumupCoques,
  useNomsProduitsSumupNonMappesCoques,
} from '@/hooks/useCoques';
import {
  useGererMappingSumupSacs,
  useGererSacs,
  useMappingSumupSacs,
  useNomsProduitsSumupNonMappesSacs,
  useSacsStock,
} from '@/hooks/useSacs';
import type {
  ChaussureMappingSumup,
  ChaussureStock,
  CoqueMappingSumup,
  CoqueStock,
  SacMappingSumup,
  SacStock,
} from '@/types/database.types';

const COULEURS_CHAUSSURES: ChaussureStock['couleur'][] = ['Noir', 'Kaki', 'Rose', 'Gris'];
const TAILLES_CHAUSSURES: ChaussureStock['taille'][] = ['36-37', '38-39', '40-41', '41-42', '43-44', '45-46'];
const MODELES_COQUES: CoqueStock['modele'][] = ['Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17'];
const VARIANTES_COQUES: CoqueStock['variante'][] = ['Normal', 'Pro', 'Pro Max', 'Plus'];
const COULEURS_COQUES_SACS: CoqueStock['couleur'][] = ['Rose', 'Noir'];
const PRODUITS_SACS: SacStock['produit'][] = ['Grandes Pochettes', 'Petites Pochettes', "Sac Pimp-it + 6 pin's"];

/** Une cellule éditable qui s'enregistre elle-même en quittant le focus — même composant pour les
 * 3 catégories, `sousLabel` porte juste ce qui varie sous le champ (taille/couleur/couleur). */
function CelluleStockInitial({
  sousLabel,
  quantite,
  onDefinir,
}: {
  sousLabel: string;
  quantite: number;
  onDefinir: (quantite: number) => void;
}) {
  const [valeur, setValeur] = useState(quantite > 0 ? String(quantite) : '');
  const [focus, setFocus] = useState(false);

  // Reprend la valeur du serveur (ex. modifiée par quelqu'un d'autre) sauf pendant que la
  // personne est justement en train de taper, pour ne pas lui couper la saisie.
  useEffect(() => {
    if (focus) return;
    setValeur(quantite > 0 ? String(quantite) : '');
  }, [quantite, focus]);

  const enregistrer = () => {
    const n = valeur.trim() === '' ? 0 : Number(valeur);
    if (!Number.isFinite(n) || n < 0) return;
    if (n !== quantite) onDefinir(n);
  };

  return (
    <View className="items-center">
      <Text className="mb-1 text-[11px] font-semibold text-slate-400">{sousLabel}</Text>
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
          quantite > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'
        }`}
      />
    </View>
  );
}

function OngletStockCibleChaussures() {
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
        calculer ce qu'il faut ramener après un inventaire (écran Stock &gt; Produits &gt; Chaussures).
      </Text>
      {COULEURS_CHAUSSURES.map((couleur) => (
        <View key={couleur} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="mb-3 text-base font-bold text-slate-900">{couleur}</Text>
          <View className="flex-row flex-wrap gap-3">
            {(parCouleur.get(couleur) ?? []).map((item) => (
              <CelluleStockInitial
                key={item.id}
                sousLabel={item.taille}
                quantite={item.stock_initial}
                onDefinir={(q) => definirStock.mutate({ id: item.id, quantite: q })}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function OngletStockCibleCoques() {
  const { data: stock, isLoading } = useCoquesStock();
  const { definirStock } = useGererCoques(undefined);

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
        Le stock visé par modèle/variante/couleur, commun à tous les pop-ups — sert de référence pour
        calculer ce qu'il faut ramener après un inventaire (écran Stock &gt; Produits &gt; Coques).
      </Text>
      {MODELES_COQUES.map((modele) => (
        <View key={modele} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="mb-3 text-base font-bold text-slate-900">{modele}</Text>
          {VARIANTES_COQUES.map((variante) => (
            <View key={variante} className="mb-3">
              <Text className="mb-1.5 text-xs font-semibold text-slate-500">{variante}</Text>
              <View className="flex-row flex-wrap gap-3">
                {(stock ?? [])
                  .filter((item) => item.modele === modele && item.variante === variante)
                  .map((item) => (
                    <CelluleStockInitial
                      key={item.id}
                      sousLabel={item.couleur}
                      quantite={item.stock_initial}
                      onDefinir={(q) => definirStock.mutate({ id: item.id, quantite: q })}
                    />
                  ))}
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function OngletStockCibleSacs() {
  const { data: stock, isLoading } = useSacsStock();
  const { definirStock } = useGererSacs(undefined);

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
        Le stock visé par produit et par couleur, commun à tous les pop-ups — sert de référence pour
        calculer ce qu'il faut ramener après un inventaire (écran Stock &gt; Produits &gt; Sac).
      </Text>
      {PRODUITS_SACS.map((produit) => (
        <View key={produit} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <Text className="mb-3 text-base font-bold text-slate-900">{produit}</Text>
          <View className="flex-row flex-wrap gap-3">
            {(stock ?? [])
              .filter((item) => item.produit === produit)
              .map((item) => (
                <CelluleStockInitial
                  key={item.id}
                  sousLabel={item.couleur}
                  quantite={item.stock_initial}
                  onDefinir={(q) => definirStock.mutate({ id: item.id, quantite: q })}
                />
              ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** Une ligne "à mapper" : nom SumUp vu dans des ventes, pas encore associé — menus déroulants puis
 * "Associer", rien n'est enregistré avant. `champs` décrit les 1 à 3 dimensions à choisir (couleur
 * seule pour un sac, modèle+variante+couleur pour une coque, etc.). */
function LigneAMapper<TValeurs extends Record<string, string>>({
  nomProduit,
  champs,
  onAssocier,
}: {
  nomProduit: string;
  champs: { cle: keyof TValeurs; label: string; options: string[] }[];
  onAssocier: (valeurs: TValeurs) => void;
}) {
  const [valeurs, setValeurs] = useState<Partial<TValeurs>>({});
  const complet = champs.every((c) => !!valeurs[c.cle]);

  return (
    <View className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <Text className="mb-2 text-sm font-semibold text-slate-800">{nomProduit}</Text>
      <View className="flex-row gap-2">
        {champs.map((c) => (
          <View key={String(c.cle)} className="flex-1">
            <Dropdown
              value={valeurs[c.cle]}
              options={c.options.map((o) => ({ value: o, label: o }))}
              onChange={(v) => setValeurs((prev) => ({ ...prev, [c.cle]: v }))}
              placeholder={c.label}
            />
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => complet && onAssocier(valeurs as TValeurs)}
        disabled={!complet}
        className={`mt-2 items-center rounded-lg py-2 ${complet ? 'bg-indigo-600' : 'bg-slate-200'}`}
      >
        <Text className={`text-sm font-semibold ${complet ? 'text-white' : 'text-slate-500'}`}>Associer</Text>
      </Pressable>
    </View>
  );
}

function OngletMappingSumupChaussures() {
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
            <LigneAMapper<{ couleur: ChaussureMappingSumup['couleur']; taille: ChaussureMappingSumup['taille'] }>
              key={nom}
              nomProduit={nom}
              champs={[
                { cle: 'couleur', label: 'Couleur', options: COULEURS_CHAUSSURES },
                { cle: 'taille', label: 'Taille', options: TAILLES_CHAUSSURES },
              ]}
              onAssocier={(v) => definirMapping.mutate({ nomProduit: nom, couleur: v.couleur, taille: v.taille })}
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

function OngletMappingSumupCoques() {
  const { data: nomsNonMappes, isLoading: chargementNonMappes } = useNomsProduitsSumupNonMappesCoques();
  const { data: mapping, isLoading: chargementMapping } = useMappingSumupCoques();
  const { definirMapping, supprimerMapping } = useGererMappingSumupCoques();

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
        Associe chaque nom de produit du catalogue SumUp à un modèle/variante/couleur — utile
        seulement si la description de la vente ne suffit pas à la déduire automatiquement.
      </Text>

      {(nomsNonMappes ?? []).length > 0 && (
        <>
          <Text className="mb-2 text-xs font-semibold uppercase text-amber-600">À associer</Text>
          {(nomsNonMappes ?? []).map((nom) => (
            <LigneAMapper<{
              modele: CoqueMappingSumup['modele'];
              variante: CoqueMappingSumup['variante'];
              couleur: CoqueMappingSumup['couleur'];
            }>
              key={nom}
              nomProduit={nom}
              champs={[
                { cle: 'modele', label: 'Modèle', options: MODELES_COQUES },
                { cle: 'variante', label: 'Variante', options: VARIANTES_COQUES },
                { cle: 'couleur', label: 'Couleur', options: COULEURS_COQUES_SACS },
              ]}
              onAssocier={(v) =>
                definirMapping.mutate({ nomProduit: nom, modele: v.modele, variante: v.variante, couleur: v.couleur })
              }
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
                {m.modele} — {m.variante} — {m.couleur}
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

function OngletMappingSumupSacs() {
  const { data: nomsNonMappes, isLoading: chargementNonMappes } = useNomsProduitsSumupNonMappesSacs();
  const { data: mapping, isLoading: chargementMapping } = useMappingSumupSacs();
  const { definirMapping, supprimerMapping } = useGererMappingSumupSacs();

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
        Associe chaque nom de produit du catalogue SumUp à un produit/couleur — utile seulement si le
        nom du produit ne correspond pas exactement à un des 3 sacs/pochettes.
      </Text>

      {(nomsNonMappes ?? []).length > 0 && (
        <>
          <Text className="mb-2 text-xs font-semibold uppercase text-amber-600">À associer</Text>
          {(nomsNonMappes ?? []).map((nom) => (
            <LigneAMapper<{ produit: SacMappingSumup['produit']; couleur: SacMappingSumup['couleur'] }>
              key={nom}
              nomProduit={nom}
              champs={[
                { cle: 'produit', label: 'Produit', options: PRODUITS_SACS },
                { cle: 'couleur', label: 'Couleur', options: COULEURS_COQUES_SACS },
              ]}
              onAssocier={(v) => definirMapping.mutate({ nomProduit: nom, produit: v.produit, couleur: v.couleur })}
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
                {m.produit} — {m.couleur}
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

type Categorie = 'chaussures' | 'coques' | 'sacs';

const CATEGORIES: { value: Categorie; label: string }[] = [
  { value: 'chaussures', label: 'Chaussures' },
  { value: 'coques', label: 'Coques' },
  { value: 'sacs', label: 'Sacs & pochettes' },
];

/** Réglages produits : stock cible (un seul jeu de valeurs par variante, partagé par tous les
 * pop-ups — décision explicite, pas de version par lieu) et correspondance SumUp (pour que le
 * réappro déduise les ventes automatiquement), pour chacune des 3 catégories gérées (chaussures,
 * coques, sacs/pochettes — cf. ProduitsMenu). Volontairement isolé de l'écran Stock > Produits (qui
 * reste, lui, propre à chaque pop-up pour l'inventaire et le réappro), et volontairement web
 * uniquement (cf. route stock-cible.web.tsx), pas besoin sur le téléphone. */
export function StockCibleEcran() {
  const [categorie, setCategorie] = useState<Categorie>('chaussures');
  const [onglet, setOnglet] = useState<'stock' | 'mapping'>('stock');

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Stock cible" />
      <View className="px-4 pt-2">
        <Dropdown
          value={categorie}
          options={CATEGORIES}
          onChange={(v) => setCategorie(v as Categorie)}
        />
      </View>
      <View className="flex-row gap-2 px-4 pt-3">
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
      {onglet === 'stock' ? (
        categorie === 'chaussures' ? (
          <OngletStockCibleChaussures />
        ) : categorie === 'coques' ? (
          <OngletStockCibleCoques />
        ) : (
          <OngletStockCibleSacs />
        )
      ) : categorie === 'chaussures' ? (
        <OngletMappingSumupChaussures />
      ) : categorie === 'coques' ? (
        <OngletMappingSumupCoques />
      ) : (
        <OngletMappingSumupSacs />
      )}
    </View>
  );
}
