import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';

import {
  calculerCommandes,
  POSITIONS_GRILLE,
  uploaderPhotoPin,
  type DernierRemplissage,
  type LigneCommande,
  type LigneHistoriqueCommande,
} from '@/api/stock';
import { CaseDetailModal } from '@/components/stock/CaseDetailModal';
import { GrilleCases } from '@/components/stock/GrilleCases';
import { ModalePhotoPin } from '@/components/stock/ModalePhotoPin';
import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { Dropdown } from '@/components/ui/Dropdown';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import {
  useAttributionsPins,
  useDerniersRemplissages,
  useGererCasesPopUp,
  useGererCatalogue,
  useGrillePopUp,
  useHistoriqueCommandes,
  useMouvements,
  useRemplissages,
  usePins,
} from '@/hooks/useStock';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import type { Profile, StockPin, TaillePin } from '@/types/database.types';

const TAILLES: { valeur: TaillePin; label: string }[] = [
  { valeur: 'petit', label: 'P' },
  { valeur: 'moyen', label: 'M' },
  { valeur: 'gros', label: 'G' },
];

function PanneauPin({ pin, profile, onFermer }: { pin: StockPin; profile: Profile; onFermer: () => void }) {
  const { modifier, ajusterStock } = useGererCatalogue();
  const { data: mouvements } = useMouvements({ pinId: pin.id });

  const [nom, setNom] = useState(pin.nom);
  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));
  const [poids, setPoids] = useState(pin.poids_unitaire !== null ? String(pin.poids_unitaire) : '');
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');

  const enregistrerNom = () => {
    const valeur = nom.trim();
    if (!valeur || valeur === pin.nom) {
      setNom(pin.nom);
      return;
    }
    modifier.mutate({ id: pin.id, params: { nom: valeur } });
  };

  const enregistrerSeuil = () => {
    const valeur = seuil.trim() === '' ? null : Number(seuil);
    if (valeur === pin.seuil_cible) return;
    modifier.mutate({ id: pin.id, params: { seuil_cible: valeur } });
  };

  const enregistrerPoids = () => {
    const brut = poids.trim() === '' ? null : Number(poids.replace(',', '.'));
    if (brut !== null && !Number.isFinite(brut)) return;
    if (brut === pin.poids_unitaire) return;
    modifier.mutate({ id: pin.id, params: { poids_unitaire: brut } });
  };

  const marquerComplet = () => modifier.mutate({ id: pin.id, params: { a_completer: false } });

  const appliquerDelta = () => {
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) return;
    ajusterStock.mutate(
      { pinId: pin.id, delta: n, note: note.trim(), profileId: profile.id },
      { onSuccess: () => { setDelta(''); setNote(''); } },
    );
  };

  return (
    <FeuilleModale onClose={onFermer}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {pin.a_completer && (
          <View className="mb-4 flex-row items-center gap-2 rounded-xl bg-amber-50 p-3">
            <Text className="flex-1 text-xs font-semibold text-amber-700">
              Pin signalé — à compléter (nom, seuil, poids…)
            </Text>
            <Pressable onPress={marquerComplet} className="rounded-lg bg-amber-600 px-3 py-1.5">
              <Text className="text-xs font-bold text-white">Marquer complet</Text>
            </Pressable>
          </View>
        )}

        <TextInput
          value={nom}
          onChangeText={setNom}
          onEndEditing={enregistrerNom}
          className="mb-1 text-lg font-bold text-slate-900"
        />
        <Text className="mb-4 text-sm text-slate-400">{pin.fournisseur ?? 'Fournisseur inconnu'}</Text>

        <View className="mb-4 flex-row justify-between rounded-xl bg-slate-50 p-3">
          <Text className="text-sm text-slate-500">Stock général</Text>
          <Text className="text-base font-bold text-slate-900">{pin.stock_general}</Text>
        </View>

        <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Taille</Text>
        <View className="mb-4 flex-row items-center gap-2">
          {TAILLES.map((t) => (
            <Pressable
              key={t.valeur}
              onPress={() => modifier.mutate({ id: pin.id, params: { taille: t.valeur } })}
              className={`h-11 w-11 items-center justify-center rounded-xl ${
                pin.taille === t.valeur ? 'bg-indigo-600' : 'bg-slate-100'
              }`}
            >
              <Text className={`text-base font-bold ${pin.taille === t.valeur ? 'text-white' : 'text-slate-500'}`}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Poids (g/10)</Text>
        <TextInput
          value={poids}
          onChangeText={setPoids}
          onEndEditing={enregistrerPoids}
          keyboardType="decimal-pad"
          placeholder="—"
          className={`mb-1 rounded-xl border px-3 py-2.5 ${
            pin.poids_unitaire === null ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200'
          }`}
        />
        <Text className={`mb-4 text-[11px] ${pin.poids_unitaire === null ? 'text-amber-600' : 'text-transparent'}`}>
          Manquant — nécessaire pour peser ce pin.
        </Text>

        <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Seuil cible</Text>
        <TextInput
          value={seuil}
          onChangeText={setSeuil}
          onEndEditing={enregistrerSeuil}
          keyboardType="numeric"
          className="mb-4 rounded-xl border border-slate-200 px-3 py-2.5"
        />

        <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">
          Ajuster le stock (après pesée)
        </Text>
        <View className="mb-2 flex-row gap-2">
          <TextInput
            value={delta}
            onChangeText={setDelta}
            keyboardType="numbers-and-punctuation"
            placeholder="+50 ou -12"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5"
          />
          <Pressable onPress={appliquerDelta} className="items-center justify-center rounded-xl bg-indigo-600 px-4">
            <Text className="font-semibold text-white">Appliquer</Text>
          </Pressable>
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note (motif, ex: réception fournisseur)"
          className="mb-5 rounded-xl border border-slate-200 px-3 py-2.5"
        />

        <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">Historique</Text>
        {(mouvements ?? []).length === 0 && (
          <Text className="mb-4 text-sm text-slate-400">Aucun mouvement enregistré.</Text>
        )}
        {(mouvements ?? []).map((m) => (
          <View key={m.id} className="mb-1.5 flex-row justify-between rounded-lg bg-slate-50 px-3 py-2">
            <Text className="text-xs text-slate-500">
              {new Date(m.created_at).toLocaleString('fr-FR')} — {m.type}
            </Text>
            <Text className="text-xs font-semibold text-slate-700">
              {m.quantite_delta !== null ? `${m.quantite_delta > 0 ? '+' : ''}${m.quantite_delta}` : `${m.quantite_calculee} restant(s)`}
            </Text>
          </View>
        ))}
      </ScrollView>

      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}

interface AttributionAffichage {
  popUpNom: string;
  casePosition: string;
}

/** Position la plus "petite" (ordre de la grille A1-G3) parmi les cases d'un pin, ou null s'il
 * n'est attribué nulle part — sert à regrouper "toutes les A1 à côté" dans le catalogue. */
function caseMinimale(attributions: AttributionAffichage[] | undefined): string | null {
  if (!attributions || attributions.length === 0) return null;
  return attributions.reduce((min, a) => (a.casePosition < min ? a.casePosition : min), attributions[0].casePosition);
}

function BadgeAttribution({ attributions }: { attributions: AttributionAffichage[] }) {
  if (attributions.length === 0) {
    return (
      <View className="self-start rounded-full bg-slate-100 px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-slate-400">Non attribué</Text>
      </View>
    );
  }
  const detail = attributions.map((a) => `${a.popUpNom} ${a.casePosition}`).join(' · ');
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="self-start rounded-full bg-emerald-100 px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-emerald-700">Attribué ({attributions.length})</Text>
      </View>
      <Text numberOfLines={1} className="flex-1 text-[10px] text-slate-400">
        {detail}
      </Text>
    </View>
  );
}

/** Ligne compacte du catalogue : uniquement ce qui sert à repérer un pin au premier coup d'œil
 * (photo, case où il est attribué, seuil). Tout le reste (nom éditable, taille, poids, historique)
 * vit dans la fiche détail, ouverte en tapant la ligne. */
function LigneCataloguePin({
  pin,
  attributions,
  onOuvrirDetail,
  onOuvrirPhoto,
}: {
  pin: StockPin;
  attributions: AttributionAffichage[];
  onOuvrirDetail: () => void;
  onOuvrirPhoto: () => void;
}) {
  const enRupture = pin.seuil_cible !== null && pin.stock_general < pin.seuil_cible;

  return (
    <View className="mb-2.5 flex-row items-center gap-3 rounded-xl bg-white p-3">
      <Pressable
        onPress={onOuvrirPhoto}
        className="h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-slate-100"
      >
        {pin.photo_url ? (
          <Image source={{ uri: pin.photo_url }} className="h-11 w-11" resizeMode="cover" />
        ) : (
          <Text className="text-xs text-slate-400">?</Text>
        )}
      </Pressable>

      <Pressable onPress={onOuvrirDetail} className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-slate-800">
          {pin.nom}
        </Text>
        <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
          <BadgeAttribution attributions={attributions} />
          <Text className="text-xs text-slate-400">Seuil : {pin.seuil_cible ?? '—'}</Text>
        </View>
        {enRupture && (
          <Text className="mt-1 text-[10px] font-semibold text-red-600">
            Rupture locale : {pin.stock_general}/{pin.seuil_cible}
          </Text>
        )}
        {pin.a_completer && (
          <Text className="mt-1 text-[10px] font-semibold text-amber-600">À compléter (signalé)</Text>
        )}
      </Pressable>

      <Pressable onPress={onOuvrirDetail} hitSlop={8} className="px-1">
        <Text className="text-lg text-indigo-400">›</Text>
      </Pressable>
    </View>
  );
}

function FiltreCase({ valeur, onChange }: { valeur: string | null; onChange: (v: string | null) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mb-3"
      contentContainerStyle={{ gap: 6 }}
    >
      <Pressable
        onPress={() => onChange(null)}
        className={`items-center justify-center rounded-full px-3 py-2 ${
          valeur === null ? 'bg-indigo-600' : 'bg-slate-100'
        }`}
      >
        <Text className={`text-xs font-semibold ${valeur === null ? 'text-white' : 'text-slate-600'}`}>
          Toutes
        </Text>
      </Pressable>
      {POSITIONS_GRILLE.map((pos) => (
        <Pressable
          key={pos}
          onPress={() => onChange(pos === valeur ? null : pos)}
          className={`items-center justify-center rounded-full px-3 py-2 ${
            valeur === pos ? 'bg-indigo-600' : 'bg-slate-100'
          }`}
        >
          <Text className={`text-xs font-semibold ${valeur === pos ? 'text-white' : 'text-slate-600'}`}>
            {pos}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function VueCatalogue({
  pins,
  chargement,
  recherche,
  onChangeRecherche,
  caseFiltre,
  onChangeCaseFiltre,
  attributionsParPin,
  onOuvrirDetail,
  onOuvrirPhoto,
  formulaireOuvert,
  onToggleFormulaire,
  signalementOuvert,
  onToggleSignalement,
  nbACompleter,
  estAdmin,
  filtreACompleter,
  onToggleFiltreACompleter,
}: {
  pins: StockPin[];
  chargement: boolean;
  recherche: string;
  onChangeRecherche: (v: string) => void;
  caseFiltre: string | null;
  onChangeCaseFiltre: (v: string | null) => void;
  attributionsParPin: Map<string, AttributionAffichage[]>;
  onOuvrirDetail: (pin: StockPin) => void;
  onOuvrirPhoto: (pin: StockPin) => void;
  formulaireOuvert: boolean;
  onToggleFormulaire: (v: boolean) => void;
  signalementOuvert: boolean;
  onToggleSignalement: (v: boolean) => void;
  nbACompleter: number;
  estAdmin: boolean;
  filtreACompleter: boolean;
  onToggleFiltreACompleter: () => void;
}) {
  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      data={pins}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <LigneCataloguePin
          pin={item}
          attributions={attributionsParPin.get(item.id) ?? []}
          onOuvrirDetail={() => onOuvrirDetail(item)}
          onOuvrirPhoto={() => onOuvrirPhoto(item)}
        />
      )}
      ListHeaderComponent={
        <>
          <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">Catalogue</Text>
          {estAdmin && nbACompleter > 0 && (
            <Pressable
              onPress={onToggleFiltreACompleter}
              className={`mb-3 flex-row items-center justify-between rounded-xl px-3 py-2.5 ${
                filtreACompleter ? 'bg-amber-600' : 'bg-amber-50'
              }`}
            >
              <Text className={`text-xs font-semibold ${filtreACompleter ? 'text-white' : 'text-amber-700'}`}>
                ⚠️ {nbACompleter} pin(s) signalé(s) à compléter
              </Text>
              <Text className={`text-xs font-semibold ${filtreACompleter ? 'text-white' : 'text-amber-700'}`}>
                {filtreACompleter ? 'Voir tout' : 'Voir'}
              </Text>
            </Pressable>
          )}
          <TextInput
            value={recherche}
            onChangeText={onChangeRecherche}
            placeholder={chargement ? 'Chargement…' : 'Rechercher un pin…'}
            className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
          />
          <Text className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Filtrer par case</Text>
          <FiltreCase valeur={caseFiltre} onChange={onChangeCaseFiltre} />
        </>
      }
      ListEmptyComponent={
        !chargement ? <Text className="mb-3 text-sm text-slate-400">Aucun résultat.</Text> : null
      }
      ListFooterComponent={
        formulaireOuvert ? (
          <FormulaireNouveauPin onFermer={() => onToggleFormulaire(false)} />
        ) : signalementOuvert ? (
          <FormulaireSignalementPin onFermer={() => onToggleSignalement(false)} />
        ) : (
          <View className="mb-6 gap-2">
            <Pressable
              onPress={() => onToggleFormulaire(true)}
              className="items-center rounded-2xl border border-dashed border-indigo-300 bg-white py-3"
            >
              <Text className="text-sm font-semibold text-indigo-600">+ Ajouter un pin au catalogue</Text>
            </Pressable>
            <Pressable
              onPress={() => onToggleSignalement(true)}
              className="items-center rounded-2xl border border-dashed border-amber-300 bg-white py-3"
            >
              <Text className="text-sm font-semibold text-amber-600">📷 Signaler un pin inconnu</Text>
            </Pressable>
          </View>
        )
      }
    />
  );
}

type FiltreAttributionValeur = 'tous' | 'attribue' | 'non_attribue';

function FiltreAttribution({
  valeur,
  onChange,
}: {
  valeur: FiltreAttributionValeur;
  onChange: (v: FiltreAttributionValeur) => void;
}) {
  const options: { valeur: FiltreAttributionValeur; label: string }[] = [
    { valeur: 'tous', label: 'Tous' },
    { valeur: 'attribue', label: 'Attribué' },
    { valeur: 'non_attribue', label: 'Non attribué' },
  ];
  return (
    <View className="flex-row gap-2">
      {options.map((o) => (
        <Pressable
          key={o.valeur}
          onPress={() => onChange(o.valeur)}
          className={`items-center justify-center rounded-full px-3 py-2 ${
            valeur === o.valeur ? 'bg-indigo-600' : 'bg-slate-100'
          }`}
        >
          <Text className={`text-xs font-semibold ${valeur === o.valeur ? 'text-white' : 'text-slate-600'}`}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Tuile du catalogue en grille (version ordinateur) : grosse photo, seuil éditable directement
 * sous la photo (pas besoin d'ouvrir la fiche détail pour ce geste très fréquent), case attribuée
 * en dessous. Le reste (nom, taille, poids, historique) reste dans la fiche détail. */
function TuileCataloguePin({
  pin,
  attributions,
  onOuvrirDetail,
  onOuvrirPhoto,
}: {
  pin: StockPin;
  attributions: AttributionAffichage[];
  onOuvrirDetail: () => void;
  onOuvrirPhoto: () => void;
}) {
  const { modifier } = useGererCatalogue();
  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));

  const enregistrerSeuil = () => {
    const brut = seuil.trim();
    const valeur = brut === '' ? null : Number(brut);
    if (valeur !== null && !Number.isFinite(valeur)) return;
    if (valeur === pin.seuil_cible) return;
    modifier.mutate({ id: pin.id, params: { seuil_cible: valeur } });
  };

  const enRupture = pin.seuil_cible !== null && pin.stock_general < pin.seuil_cible;

  return (
    <View className="w-[10%] p-1.5">
      <View className={`overflow-hidden rounded-xl border bg-white ${enRupture ? 'border-red-300' : 'border-slate-100'}`}>
        <Pressable onPress={onOuvrirPhoto} className="aspect-square w-full items-center justify-center bg-slate-100">
          {pin.photo_url ? (
            <Image source={{ uri: pin.photo_url }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <Text className="text-xs text-slate-400">?</Text>
          )}
        </Pressable>
        <Pressable onPress={onOuvrirDetail} className="px-2 pt-2">
          <Text numberOfLines={1} className="text-xs font-semibold text-slate-800">
            {pin.nom}
          </Text>
        </Pressable>
        <View className="flex-row items-center gap-1 px-2 pb-1 pt-1.5">
          <Text className="text-[10px] text-slate-400">Seuil</Text>
          <TextInput
            value={seuil}
            onChangeText={setSeuil}
            onEndEditing={enregistrerSeuil}
            keyboardType="numeric"
            placeholder="—"
            className="flex-1 rounded-md border border-slate-200 px-1.5 py-1 text-xs"
          />
        </View>
        <View className="px-2 pb-2">
          <Text
            numberOfLines={1}
            className={`text-[10px] font-semibold ${attributions.length > 0 ? 'text-emerald-700' : 'text-slate-400'}`}
          >
            {attributions.length > 0
              ? attributions.map((a) => `${a.popUpNom} ${a.casePosition}`).join(' · ')
              : 'Non attribué'}
          </Text>
          {enRupture && (
            <Text className="mt-0.5 text-[10px] font-bold text-red-600">
              Rupture : {pin.stock_general}/{pin.seuil_cible}
            </Text>
          )}
          {pin.a_completer && <Text className="mt-0.5 text-[10px] font-bold text-amber-600">À compléter</Text>}
        </View>
      </View>
    </View>
  );
}

/** Catalogue en grille (ordinateur) : 10 photos par ligne, seuil éditable directement sous chaque
 * photo, case attribuée affichée, filtre attribué/non-attribué en plus du filtre par case déjà
 * présent côté mobile. Sélectionné automatiquement via `Platform.OS === 'web'` dans `StockScreen`
 * plutôt qu'une route séparée : uniquement la disposition du catalogue change, tout le reste de
 * l'écran Stock (Boîtes/Rapport/Local, modales) reste identique. */
function VueCatalogueWeb({
  pins,
  chargement,
  recherche,
  onChangeRecherche,
  caseFiltre,
  onChangeCaseFiltre,
  filtreAttribution,
  onChangeFiltreAttribution,
  attributionsParPin,
  onOuvrirDetail,
  onOuvrirPhoto,
  formulaireOuvert,
  onToggleFormulaire,
  signalementOuvert,
  onToggleSignalement,
  nbACompleter,
  estAdmin,
  filtreACompleter,
  onToggleFiltreACompleter,
}: {
  pins: StockPin[];
  chargement: boolean;
  recherche: string;
  onChangeRecherche: (v: string) => void;
  caseFiltre: string | null;
  onChangeCaseFiltre: (v: string | null) => void;
  filtreAttribution: FiltreAttributionValeur;
  onChangeFiltreAttribution: (v: FiltreAttributionValeur) => void;
  attributionsParPin: Map<string, AttributionAffichage[]>;
  onOuvrirDetail: (pin: StockPin) => void;
  onOuvrirPhoto: (pin: StockPin) => void;
  formulaireOuvert: boolean;
  onToggleFormulaire: (v: boolean) => void;
  signalementOuvert: boolean;
  onToggleSignalement: (v: boolean) => void;
  nbACompleter: number;
  estAdmin: boolean;
  filtreACompleter: boolean;
  onToggleFiltreACompleter: () => void;
}) {
  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      data={pins}
      numColumns={10}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <TuileCataloguePin
          pin={item}
          attributions={attributionsParPin.get(item.id) ?? []}
          onOuvrirDetail={() => onOuvrirDetail(item)}
          onOuvrirPhoto={() => onOuvrirPhoto(item)}
        />
      )}
      ListHeaderComponent={
        <>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase text-slate-400">Catalogue</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => onToggleFormulaire(!formulaireOuvert)}
                className="rounded-lg border border-dashed border-indigo-300 bg-white px-3 py-2"
              >
                <Text className="text-xs font-semibold text-indigo-600">+ Ajouter un pin</Text>
              </Pressable>
              <Pressable
                onPress={() => onToggleSignalement(!signalementOuvert)}
                className="rounded-lg border border-dashed border-amber-300 bg-white px-3 py-2"
              >
                <Text className="text-xs font-semibold text-amber-600">📷 Signaler un pin inconnu</Text>
              </Pressable>
            </View>
          </View>

          {formulaireOuvert && <FormulaireNouveauPin onFermer={() => onToggleFormulaire(false)} />}
          {signalementOuvert && <FormulaireSignalementPin onFermer={() => onToggleSignalement(false)} />}

          {estAdmin && nbACompleter > 0 && (
            <Pressable
              onPress={onToggleFiltreACompleter}
              className={`mb-3 flex-row items-center justify-between rounded-xl px-3 py-2.5 ${
                filtreACompleter ? 'bg-amber-600' : 'bg-amber-50'
              }`}
            >
              <Text className={`text-xs font-semibold ${filtreACompleter ? 'text-white' : 'text-amber-700'}`}>
                ⚠️ {nbACompleter} pin(s) signalé(s) à compléter
              </Text>
              <Text className={`text-xs font-semibold ${filtreACompleter ? 'text-white' : 'text-amber-700'}`}>
                {filtreACompleter ? 'Voir tout' : 'Voir'}
              </Text>
            </Pressable>
          )}

          <TextInput
            value={recherche}
            onChangeText={onChangeRecherche}
            placeholder={chargement ? 'Chargement…' : 'Rechercher un pin…'}
            className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
          />

          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase text-slate-400">Attribution</Text>
            <FiltreAttribution valeur={filtreAttribution} onChange={onChangeFiltreAttribution} />
          </View>

          <Text className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Filtrer par case</Text>
          <FiltreCase valeur={caseFiltre} onChange={onChangeCaseFiltre} />
        </>
      }
      ListEmptyComponent={
        !chargement ? <Text className="mb-3 text-sm text-slate-400">Aucun résultat.</Text> : null
      }
    />
  );
}

interface GroupeJourRemplissages {
  jourISO: string;
  lignes: DernierRemplissage[];
}

/** Regroupe l'historique des remplissages par jour, du plus récent au plus ancien — trace de qui
 * a rempli quelle boîte et quand. */
function grouperRemplissagesParJour(remplissages: DernierRemplissage[]): GroupeJourRemplissages[] {
  const parJour = new Map<string, DernierRemplissage[]>();

  for (const r of remplissages) {
    const jourISO = r.createdAt.slice(0, 10);
    const liste = parJour.get(jourISO) ?? [];
    liste.push(r);
    parJour.set(jourISO, liste);
  }

  return [...parJour.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([jourISO, lignes]) => ({
      jourISO,
      lignes: [...lignes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }));
}

function RapportRemplissages({
  remplissagesParJour,
  estAdmin,
  onPressBoite,
  onSupprimer,
}: {
  remplissagesParJour: GroupeJourRemplissages[];
  estAdmin: boolean;
  onPressBoite: (casePosition: string) => void;
  onSupprimer: (id: string) => void;
}) {
  if (remplissagesParJour.length === 0) {
    return (
      <Text className="text-sm text-slate-400">Aucun remplissage enregistré pour l'instant sur ce pop-up.</Text>
    );
  }

  return (
    <>
      {remplissagesParJour.map((jour) => (
        <View key={jour.jourISO} className="mb-5">
          <Text className="mb-2 text-sm font-bold capitalize text-slate-900">
            {format(parseISO(jour.jourISO), 'EEEE d MMMM yyyy', { locale: fr })}
          </Text>
          {jour.lignes.map((ligne) => (
            <View key={ligne.id} className="mb-2 flex-row items-center rounded-xl bg-white p-3">
              <Pressable
                onPress={() => onPressBoite(ligne.casePosition)}
                className="flex-1 flex-row items-center justify-between"
              >
                <Text className="text-sm font-bold text-slate-800">Boîte {ligne.casePosition}</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-slate-400">
                    {ligne.profileNom} · {format(new Date(ligne.createdAt), 'HH:mm')}
                  </Text>
                  <Text className="text-lg text-indigo-400">›</Text>
                </View>
              </Pressable>
              {estAdmin && (
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      'Supprimer ce remplissage',
                      `Supprimer le remplissage de la boîte ${ligne.casePosition} par ${ligne.profileNom} ? Cette action est irréversible.`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Supprimer', style: 'destructive', onPress: () => onSupprimer(ligne.id) },
                      ],
                    )
                  }
                  hitSlop={8}
                  className="ml-3 px-1 py-1"
                >
                  <Text className="text-xs font-semibold text-red-500">Supprimer</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

interface GroupeJourHistoriqueCommande {
  jourISO: string;
  lignes: LigneHistoriqueCommande[];
}

function grouperHistoriqueParJour(lignes: LigneHistoriqueCommande[]): GroupeJourHistoriqueCommande[] {
  const parJour = new Map<string, LigneHistoriqueCommande[]>();

  for (const l of lignes) {
    const jourISO = l.createdAt.slice(0, 10);
    const liste = parJour.get(jourISO) ?? [];
    liste.push(l);
    parJour.set(jourISO, liste);
  }

  return [...parJour.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([jourISO, lignesJour]) => ({ jourISO, lignes: lignesJour }));
}

function PanneauHistoriqueCommandes({
  lignes,
  popUpNom,
  onFermer,
}: {
  lignes: LigneHistoriqueCommande[];
  popUpNom: string;
  onFermer: () => void;
}) {
  const parJour = useMemo(() => grouperHistoriqueParJour(lignes), [lignes]);

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-1 text-lg font-bold text-slate-900">Historique des commandes — {popUpNom}</Text>
      <Text className="mb-4 text-sm text-slate-400">
        Trouvé = coché comme commandé au moment de la validation ; c'est ce qui fait monter ou
        baisser le seuil cible automatiquement d'une semaine sur l'autre.
      </Text>

      <ScrollView style={{ maxHeight: 480 }}>
        {parJour.length === 0 ? (
          <Text className="text-sm text-slate-400">Aucune commande validée pour l'instant sur ce pop-up.</Text>
        ) : (
          parJour.map((jour) => (
            <View key={jour.jourISO} className="mb-5">
              <Text className="mb-2 text-sm font-bold capitalize text-slate-900">
                {format(parseISO(jour.jourISO), 'EEEE d MMMM yyyy', { locale: fr })}
              </Text>
              {jour.lignes.map((ligne) => (
                <View
                  key={ligne.id}
                  className={`mb-1.5 flex-row items-center justify-between rounded-lg px-3 py-2 ${
                    ligne.trouve ? 'bg-emerald-50' : 'bg-slate-50'
                  }`}
                >
                  <Text numberOfLines={1} className="flex-1 text-sm text-slate-700">
                    {ligne.pinNom}
                  </Text>
                  <Text
                    className={`ml-2 text-xs font-semibold ${ligne.trouve ? 'text-emerald-700' : 'text-slate-400'}`}
                  >
                    {ligne.trouve ? 'Trouvé' : 'Pas trouvé'} · {ligne.profileNom} ·{' '}
                    {format(new Date(ligne.createdAt), 'HH:mm')}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}

function PanneauCommande({
  lignes,
  popUpNom,
  enCours,
  onValider,
  onFermer,
}: {
  lignes: LigneCommande[];
  popUpNom: string;
  enCours: boolean;
  onValider: (resultats: { pinId: string; trouve: boolean }[]) => void;
  onFermer: () => void;
}) {
  // Coché = "trouvé/commandé pendant cette tournée" — envoyé à la validation, ça alimente
  // l'historique et le cron hebdomadaire qui ajuste seuil_cible (pin souvent trouvé → seuil monte,
  // jamais trouvé → seuil baisse).
  const [coches, setCoches] = useState<Set<string>>(new Set());

  const basculer = (pinId: string) => {
    setCoches((precedente) => {
      const suivante = new Set(precedente);
      if (suivante.has(pinId)) suivante.delete(pinId);
      else suivante.add(pinId);
      return suivante;
    });
  };

  const confirmerValidation = () => {
    Alert.alert(
      'Valider la commande reçue',
      `Une fois les pins ramenés, ça retire "à commander" de toutes les boîtes de ${popUpNom}. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          style: 'destructive',
          onPress: () =>
            onValider(lignes.map((l) => ({ pinId: l.pin.id, trouve: coches.has(l.pin.id) }))),
        },
      ],
    );
  };

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-1 text-lg font-bold text-slate-900">Commande — {popUpNom}</Text>
      <Text className="mb-4 text-sm text-slate-400">
        Pins signalés "à commander" sur les boîtes de ce pop-up. Coche ceux que tu as
        trouvés/commandés : ça sert à ajuster automatiquement leur seuil cible dans le temps.
      </Text>

      <ScrollView style={{ maxHeight: 480 }}>
        {lignes.length === 0 ? (
          <Text className="text-sm text-slate-400">Rien à commander pour l'instant.</Text>
        ) : (
          lignes.map((ligne) => {
            const coche = coches.has(ligne.pin.id);
            return (
              <Pressable
                key={ligne.pin.id}
                onPress={() => basculer(ligne.pin.id)}
                className={`mb-2 flex-row items-center gap-3 rounded-xl p-2 ${coche ? 'bg-emerald-50' : 'bg-slate-50'}`}
              >
                {ligne.pin.photo_url ? (
                  <Image source={{ uri: ligne.pin.photo_url }} className="h-14 w-14 rounded-lg bg-slate-100" />
                ) : (
                  <View className="h-14 w-14 items-center justify-center rounded-lg bg-slate-100">
                    <Text className="text-lg text-slate-300">?</Text>
                  </View>
                )}
                <Text
                  numberOfLines={2}
                  className={`flex-1 text-sm ${coche ? 'text-slate-400 line-through' : 'font-semibold text-slate-800'}`}
                >
                  {ligne.pin.nom}
                </Text>
                <Text className="text-base font-bold text-amber-700">{ligne.pin.seuil_cible ?? '—'}</Text>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
                    coche ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                  }`}
                >
                  {coche && <Text className="text-xs font-bold text-white">✓</Text>}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Pressable
        onPress={confirmerValidation}
        disabled={enCours || lignes.length === 0}
        className={`mt-4 items-center rounded-xl py-3.5 ${lignes.length === 0 ? 'bg-slate-200' : 'bg-emerald-500'}`}
      >
        <Text className={`text-base font-bold ${lignes.length === 0 ? 'text-slate-500' : 'text-white'}`}>
          {enCours ? 'Validation…' : 'Valider la commande reçue'}
        </Text>
      </Pressable>
      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}

function FormulaireNouveauPin({ onFermer }: { onFermer: () => void }) {
  const { creer } = useGererCatalogue();
  const [nom, setNom] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [seuil, setSeuil] = useState('');
  const [poids, setPoids] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [televersementEnCours, setTeleversementEnCours] = useState(false);

  const choisirPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission refusée', "Autorise l'accès à tes photos pour en choisir une.");
      return;
    }
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (resultat.canceled) return;
    const asset = resultat.assets[0];
    if (!asset.base64) return;
    setPhoto({ uri: asset.uri, base64: asset.base64 });
  };

  const enCours = televersementEnCours || creer.isPending;

  const valider = async () => {
    if (!nom.trim() || enCours) return;
    try {
      setTeleversementEnCours(true);
      const photoUrl = photo ? await uploaderPhotoPin(photo.base64) : undefined;
      setTeleversementEnCours(false);
      await creer.mutateAsync({
        nom: nom.trim(),
        fournisseur: fournisseur.trim() || undefined,
        seuilCible: seuil ? Number(seuil) : undefined,
        poidsUnitaire: poids ? Number(poids.replace(',', '.')) : undefined,
        photoUrl,
      });
      onFermer();
    } catch {
      setTeleversementEnCours(false);
      Alert.alert('Erreur', "Impossible de créer le pin. Réessaie.");
    }
  };

  return (
    <View className="mb-4 rounded-2xl border border-dashed border-indigo-300 bg-white p-4">
      <Pressable
        onPress={choisirPhoto}
        className="mb-3 h-24 w-24 items-center justify-center overflow-hidden rounded-xl bg-slate-100"
      >
        {photo ? (
          <Image source={{ uri: photo.uri }} className="h-24 w-24" resizeMode="cover" />
        ) : (
          <Text className="px-2 text-center text-xs font-semibold text-slate-400">+ Photo</Text>
        )}
      </Pressable>
      <TextInput
        value={nom}
        onChangeText={setNom}
        placeholder="Nom du pin"
        className="mb-3 rounded-lg border border-slate-200 px-3 py-2"
      />
      <TextInput
        value={fournisseur}
        onChangeText={setFournisseur}
        placeholder="Fournisseur"
        className="mb-3 rounded-lg border border-slate-200 px-3 py-2"
      />
      <View className="mb-3 flex-row gap-2">
        <TextInput
          value={poids}
          onChangeText={setPoids}
          keyboardType="decimal-pad"
          placeholder="Poids (g/10)"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2"
        />
        <TextInput
          value={seuil}
          onChangeText={setSeuil}
          keyboardType="numeric"
          placeholder="Seuil cible"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2"
        />
      </View>
      <View className="flex-row gap-2">
        <Pressable onPress={onFermer} className="flex-1 items-center rounded-lg border border-slate-200 py-2">
          <Text className="font-semibold text-slate-600">Annuler</Text>
        </Pressable>
        <Pressable
          onPress={valider}
          disabled={enCours}
          className={`flex-1 items-center rounded-lg py-2 ${enCours ? 'bg-indigo-300' : 'bg-indigo-600'}`}
        >
          <Text className="font-semibold text-white">
            {televersementEnCours ? 'Envoi de la photo…' : creer.isPending ? 'Création…' : 'Créer'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Signalement rapide d'un pin trouvé physiquement mais absent du catalogue : juste une photo (+
 * note libre), pas besoin de connaître son nom exact tout de suite — il apparaît "à compléter"
 * dans le catalogue et fait remonter le badge d'alerte admin jusqu'à ce qu'il soit complété. */
function FormulaireSignalementPin({ onFermer }: { onFermer: () => void }) {
  const { signaler } = useGererCatalogue();
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [televersementEnCours, setTeleversementEnCours] = useState(false);

  const choisirPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission refusée', "Autorise l'accès à tes photos pour en choisir une.");
      return;
    }
    const resultat = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.6,
      base64: true,
    });
    if (resultat.canceled) return;
    const asset = resultat.assets[0];
    if (!asset.base64) return;
    setPhoto({ uri: asset.uri, base64: asset.base64 });
  };

  const enCours = televersementEnCours || signaler.isPending;

  const valider = async () => {
    if (!photo || enCours) return;
    try {
      setTeleversementEnCours(true);
      const photoUrl = await uploaderPhotoPin(photo.base64);
      setTeleversementEnCours(false);
      await signaler.mutateAsync({ photoUrl, note: note.trim() || undefined });
      onFermer();
    } catch {
      setTeleversementEnCours(false);
      Alert.alert('Erreur', "Impossible d'enregistrer le signalement. Réessaie.");
    }
  };

  return (
    <View className="mb-4 rounded-2xl border border-dashed border-amber-300 bg-white p-4">
      <Text className="mb-3 text-xs text-slate-500">
        Pin trouvé physiquement mais absent du catalogue : prends-le en photo, un admin complètera
        le nom, le seuil et le poids ensuite.
      </Text>
      <Pressable
        onPress={choisirPhoto}
        className="mb-3 h-24 w-24 items-center justify-center overflow-hidden rounded-xl bg-slate-100"
      >
        {photo ? (
          <Image source={{ uri: photo.uri }} className="h-24 w-24" resizeMode="cover" />
        ) : (
          <Text className="px-2 text-center text-xs font-semibold text-slate-400">+ Photo</Text>
        )}
      </Pressable>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optionnel)"
        className="mb-3 rounded-lg border border-slate-200 px-3 py-2"
      />
      <View className="flex-row gap-2">
        <Pressable onPress={onFermer} className="flex-1 items-center rounded-lg border border-slate-200 py-2">
          <Text className="font-semibold text-slate-600">Annuler</Text>
        </Pressable>
        <Pressable
          onPress={valider}
          disabled={!photo || enCours}
          className={`flex-1 items-center rounded-lg py-2 ${!photo || enCours ? 'bg-amber-300' : 'bg-amber-600'}`}
        >
          <Text className="font-semibold text-white">
            {televersementEnCours ? 'Envoi de la photo…' : signaler.isPending ? 'Envoi…' : 'Signaler'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface PopUpDemandeur {
  popUpNom: string;
}

/** Urgence d'un pin pour le tri de l'onglet Local : 2 = en rupture (sous son seuil cible), 1 =
 * demandé par au moins un pop-up (a_commander), 0 = rien à signaler. Sert uniquement à faire
 * remonter les pins qui comptent en haut de la liste, sans les cacher pour autant — n'importe quel
 * pin reste pesable à tout moment (recherche). */
function urgencePin(pin: StockPin, demandeurs: PopUpDemandeur[] | undefined): number {
  if (pin.seuil_cible !== null && pin.stock_general < pin.seuil_cible) return 2;
  if (demandeurs && demandeurs.length > 0) return 1;
  return 0;
}

function LigneLocalPin({
  pin,
  demandeurs,
  onPeser,
}: {
  pin: StockPin;
  demandeurs: PopUpDemandeur[];
  onPeser: () => void;
}) {
  const enRupture = pin.seuil_cible !== null && pin.stock_general < pin.seuil_cible;

  return (
    <View
      className={`mb-2.5 flex-row items-center gap-3 rounded-xl p-3 ${
        enRupture ? 'border border-red-200 bg-red-50' : 'bg-white'
      }`}
    >
      {pin.photo_url ? (
        <Image source={{ uri: pin.photo_url }} className="h-12 w-12 rounded-lg bg-slate-100" />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
          <Text className="text-xs text-slate-300">?</Text>
        </View>
      )}
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-slate-800">
          {pin.nom}
        </Text>
        <Text className={`text-xs ${enRupture ? 'font-bold text-red-600' : 'text-slate-400'}`}>
          {pin.stock_general} en stock{pin.seuil_cible !== null ? ` · seuil ${pin.seuil_cible}` : ''}
        </Text>
        {demandeurs.length > 0 && (
          <Text numberOfLines={1} className="text-[11px] text-amber-600">
            Demandé par {demandeurs.map((d) => d.popUpNom).join(', ')}
          </Text>
        )}
      </View>
      <Pressable onPress={onPeser} className="items-center justify-center rounded-lg bg-indigo-600 px-3.5 py-2.5">
        <Text className="text-xs font-bold text-white">Peser</Text>
      </Pressable>
    </View>
  );
}

function VueLocal({
  pins,
  chargement,
  recherche,
  onChangeRecherche,
  demandesParPin,
  onPeser,
}: {
  pins: StockPin[];
  chargement: boolean;
  recherche: string;
  onChangeRecherche: (v: string) => void;
  demandesParPin: Map<string, PopUpDemandeur[]>;
  onPeser: (pin: StockPin) => void;
}) {
  const pinsTries = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = q ? pins.filter((p) => p.nom.toLowerCase().includes(q)) : pins;
    return [...liste].sort((a, b) => {
      const urgenceA = urgencePin(a, demandesParPin.get(a.id));
      const urgenceB = urgencePin(b, demandesParPin.get(b.id));
      if (urgenceA !== urgenceB) return urgenceB - urgenceA;
      return a.nom.localeCompare(b.nom);
    });
  }, [pins, recherche, demandesParPin]);

  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      data={pinsTries}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <LigneLocalPin
          pin={item}
          demandeurs={demandesParPin.get(item.id) ?? []}
          onPeser={() => onPeser(item)}
        />
      )}
      ListHeaderComponent={
        <>
          <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Stock local</Text>
          <Text className="mb-3 text-xs text-slate-400">
            En rouge : sous le seuil cible. "Demandé par" : au moins une case pop-up a coché
            "Commander" pour ce pin. Pèse ce qu'il reste après avoir servi une commande pour
            recalculer le stock automatiquement.
          </Text>
          <TextInput
            value={recherche}
            onChangeText={onChangeRecherche}
            placeholder={chargement ? 'Chargement…' : 'Rechercher un pin à peser…'}
            className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
          />
        </>
      }
      ListEmptyComponent={
        !chargement ? <Text className="mb-3 text-sm text-slate-400">Aucun résultat.</Text> : null
      }
    />
  );
}

function PanneauPesee({
  pin,
  popUpLocalId,
  profile,
  onFermer,
}: {
  pin: StockPin;
  popUpLocalId: string;
  profile: Profile;
  onFermer: () => void;
}) {
  const { peser } = useGererCatalogue();
  const [poids, setPoids] = useState('');

  const poidsNum = Number(poids.trim().replace(',', '.'));
  const poidsValide = poids.trim() !== '' && Number.isFinite(poidsNum) && poidsNum >= 0;
  const quantitePrevue =
    pin.poids_unitaire && poidsValide ? Math.max(0, Math.round((poidsNum / pin.poids_unitaire) * 10)) : null;
  const delta = quantitePrevue !== null ? quantitePrevue - pin.stock_general : null;

  const confirmer = () => {
    if (!poidsValide) return;
    peser.mutate(
      { pinId: pin.id, popUpLocalId, poidsPese: poidsNum, profileId: profile.id },
      {
        onSuccess: onFermer,
        onError: (e) =>
          Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer la pesée.'),
      },
    );
  };

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-1 text-lg font-bold text-slate-900">Peser — {pin.nom}</Text>
      <Text className="mb-4 text-sm text-slate-400">Stock actuel : {pin.stock_general} pin(s)</Text>

      {pin.poids_unitaire === null ? (
        <Text className="mb-4 text-sm text-amber-600">
          Poids (g/10) manquant pour ce pin — renseigne-le dans l'onglet Catalogue avant de pouvoir
          le peser.
        </Text>
      ) : (
        <>
          <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">
            Poids restant pesé (g)
          </Text>
          <TextInput
            value={poids}
            onChangeText={setPoids}
            keyboardType="decimal-pad"
            autoFocus
            placeholder="Ex : 145"
            className="mb-3 rounded-xl border border-slate-200 px-4 py-3 text-base"
          />
          {quantitePrevue !== null && (
            <View className="mb-4 rounded-xl bg-slate-50 p-3">
              <Text className="text-sm text-slate-600">
                ≈ <Text className="font-bold text-slate-900">{quantitePrevue}</Text> pin(s) restant(s)
              </Text>
              {delta !== null && delta !== 0 && (
                <Text className={`mt-1 text-xs font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {delta > 0 ? '+' : ''}
                  {delta} par rapport au stock actuel
                </Text>
              )}
            </View>
          )}
          <Pressable
            onPress={confirmer}
            disabled={!poidsValide || peser.isPending}
            className={`items-center rounded-xl py-3.5 ${poidsValide ? 'bg-indigo-600' : 'bg-slate-200'}`}
          >
            <Text className={`text-base font-bold ${poidsValide ? 'text-white' : 'text-slate-500'}`}>
              {peser.isPending ? 'Enregistrement…' : 'Enregistrer la pesée'}
            </Text>
          </Pressable>
        </>
      )}

      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}

/** Écran Stock complet (Boîtes / Catalogue / Rapport, + Local) — identique pour tout le monde côté
 * Boîtes/Catalogue/Rapport. Seule différence, imposée par les droits en base (RLS, écriture sur
 * stock_pins réservée aux admins) : créer un pin, modifier son seuil cible ou ajuster le stock
 * général sont réservés aux admins, et la roulette pop-up ne propose que les lieux attribués pour
 * un non-admin (tous pour un admin, cf. estAttribueA/popUpsAttribues déjà utilisés partout
 * ailleurs dans l'app). Compter les boîtes (commander/remplir/attribuer des pins) reste identique
 * pour tous, sur leurs lieux.
 *
 * Onglet "Local" (nouveau) : réservé aux admins et aux personnes attribuées au pop-up "local"
 * (pop_ups.est_local) — c'est là qu'on pèse le stock qui alimente ensuite les pop-ups, jamais aux
 * pop-ups eux-mêmes (leur flux "Commander" sur les boîtes reste inchangé).
 */
export function StockScreen({ profile, onRetour }: { profile: Profile; onRetour: () => void }) {
  const estAdmin = profile.role === 'admin';
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const { data: pins, isLoading: chargementPins } = usePins();
  const { data: attributions } = useAttributionsPins();

  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const popUps = estAdmin ? (popUpsTous ?? []) : popUpsAttribues(profile, mapAffectations, popUpsTous ?? []);

  const popUpLocal = useMemo(() => popUpsTous?.find((p) => p.est_local), [popUpsTous]);
  const estAuLocal = !!popUpLocal && (mapAffectations.get(profile.id)?.has(popUpLocal.id) ?? false);
  const montrerOngletLocal = !!popUpLocal && (estAdmin || estAuLocal);

  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  const popUpActif = popUpId ?? popUps[0]?.id;

  const { data: grille, isLoading: chargementGrille } = useGrillePopUp(popUpActif);
  const { attribuer, basculerCommande, validerRemplissage, validerCommandes, supprimerRemplissage } =
    useGererCasesPopUp(popUpActif);
  const { data: derniersRemplissages } = useDerniersRemplissages(popUpActif);
  const { data: remplissages, isLoading: chargementRapport } = useRemplissages(popUpActif);
  const { data: historiqueCommandes } = useHistoriqueCommandes(popUpActif);

  const [vue, setVue] = useState<'boites' | 'catalogue' | 'rapport' | 'local'>('boites');
  const [rechercheLocal, setRechercheLocal] = useState('');
  const [pinAPeser, setPinAPeser] = useState<StockPin | null>(null);
  // Seule la position est mémorisée — le contenu est relu à chaque rendu depuis `grille` (source
  // de vérité toujours à jour), pour que le poids saisi apparaisse immédiatement dans la case
  // encore ouverte, sans avoir à la fermer et la rouvrir pour rafraîchir l'affichage.
  const [casePositionOuverte, setCasePositionOuverte] = useState<string | null>(null);
  const contenusOuverts = grille?.find((c) => c.casePosition === casePositionOuverte)?.contenus ?? [];
  const [recherche, setRecherche] = useState('');
  const [caseFiltre, setCaseFiltre] = useState<string | null>(null);
  const [filtreAttribution, setFiltreAttribution] = useState<FiltreAttributionValeur>('tous');
  const [pinOuvert, setPinOuvert] = useState<StockPin | null>(null);
  const [pinPhotoOuvert, setPinPhotoOuvert] = useState<StockPin | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [signalementOuvert, setSignalementOuvert] = useState(false);
  const [filtreACompleter, setFiltreACompleter] = useState(false);
  const [commandeOuverte, setCommandeOuverte] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  const nbACompleter = useMemo(() => (pins ?? []).filter((p) => p.a_completer).length, [pins]);

  const attributionsParPin = useMemo(() => {
    const map = new Map<string, AttributionAffichage[]>();
    for (const a of attributions ?? []) {
      const popUpNom = popUpsTous?.find((p) => p.id === a.pop_up_id)?.nom ?? '?';
      const liste = map.get(a.pin_id) ?? [];
      liste.push({ popUpNom, casePosition: a.case_position });
      map.set(a.pin_id, liste);
    }
    return map;
  }, [attributions, popUpsTous]);

  // Pins actuellement "à commander" sur au moins une case d'un pop-up (jamais le local lui-même,
  // ses propres cases ne sont pas une demande adressée au local) — dédupliqué par pop-up, un pin
  // présent dans deux cases du même pop-up ne doit pas afficher deux fois ce pop-up dans le badge.
  const demandesParPin = useMemo(() => {
    const map = new Map<string, PopUpDemandeur[]>();
    if (!popUpLocal) return map;
    const popUpsDejaVus = new Map<string, Set<string>>();
    for (const a of attributions ?? []) {
      if (!a.a_commander || a.pop_up_id === popUpLocal.id) continue;
      const vus = popUpsDejaVus.get(a.pin_id) ?? new Set<string>();
      if (vus.has(a.pop_up_id)) continue;
      vus.add(a.pop_up_id);
      popUpsDejaVus.set(a.pin_id, vus);
      const popUpNom = popUpsTous?.find((p) => p.id === a.pop_up_id)?.nom ?? '?';
      const liste = map.get(a.pin_id) ?? [];
      liste.push({ popUpNom });
      map.set(a.pin_id, liste);
    }
    return map;
  }, [attributions, popUpsTous, popUpLocal]);

  const pinsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let liste = pins ?? [];
    if (filtreACompleter) liste = liste.filter((p) => p.a_completer);
    if (filtreAttribution === 'attribue') liste = liste.filter((p) => (attributionsParPin.get(p.id)?.length ?? 0) > 0);
    else if (filtreAttribution === 'non_attribue')
      liste = liste.filter((p) => (attributionsParPin.get(p.id)?.length ?? 0) === 0);
    if (q) liste = liste.filter((p) => p.nom.toLowerCase().includes(q));
    if (caseFiltre) {
      liste = liste.filter((p) => (attributionsParPin.get(p.id) ?? []).some((a) => a.casePosition === caseFiltre));
    } else {
      // "Toutes" : regroupe les pins par case (toutes les A1 ensemble, puis A2...), non attribués
      // à la fin, plutôt que l'ordre alphabétique par défaut.
      liste = [...liste].sort((a, b) => {
        const caseA = caseMinimale(attributionsParPin.get(a.id));
        const caseB = caseMinimale(attributionsParPin.get(b.id));
        if (caseA === caseB) return a.nom.localeCompare(b.nom);
        if (caseA === null) return 1;
        if (caseB === null) return -1;
        return caseA.localeCompare(caseB);
      });
    }
    return liste;
  }, [pins, recherche, caseFiltre, attributionsParPin, filtreACompleter, filtreAttribution]);

  const remplissagesParJour = useMemo(() => grouperRemplissagesParJour(remplissages ?? []), [remplissages]);
  const commandeLignes = useMemo(() => calculerCommandes(grille ?? []), [grille]);

  if (chargementPopUps) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Pin's" onRetour={onRetour} />

      <View className="flex-row gap-2 px-4 pt-4">
        <Pressable
          onPress={() => setVue('boites')}
          className={`flex-1 items-center rounded-lg py-2.5 ${vue === 'boites' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={vue === 'boites' ? 'font-semibold text-white' : 'text-slate-600'}>Boîtes</Text>
        </Pressable>
        <Pressable
          onPress={() => setVue('catalogue')}
          className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5 ${
            vue === 'catalogue' ? 'bg-indigo-600' : 'bg-slate-100'
          }`}
        >
          <Text className={vue === 'catalogue' ? 'font-semibold text-white' : 'text-slate-600'}>
            Catalogue
          </Text>
          {estAdmin && nbACompleter > 0 && (
            <View className="h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1">
              <Text className="text-[10px] font-bold text-white">{nbACompleter}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setVue('rapport')}
          className={`flex-1 items-center rounded-lg py-2.5 ${vue === 'rapport' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={vue === 'rapport' ? 'font-semibold text-white' : 'text-slate-600'}>
            Rapport
          </Text>
        </Pressable>
        {montrerOngletLocal && (
          <Pressable
            onPress={() => setVue('local')}
            className={`flex-1 items-center rounded-lg py-2.5 ${vue === 'local' ? 'bg-indigo-600' : 'bg-slate-100'}`}
          >
            <Text className={vue === 'local' ? 'font-semibold text-white' : 'text-slate-600'}>
              Local
            </Text>
          </Pressable>
        )}
      </View>

      {vue === 'catalogue' ? (
        Platform.OS === 'web' ? (
          <VueCatalogueWeb
            pins={pinsAffiches}
            chargement={chargementPins}
            recherche={recherche}
            onChangeRecherche={setRecherche}
            caseFiltre={caseFiltre}
            onChangeCaseFiltre={setCaseFiltre}
            filtreAttribution={filtreAttribution}
            onChangeFiltreAttribution={setFiltreAttribution}
            attributionsParPin={attributionsParPin}
            onOuvrirDetail={setPinOuvert}
            onOuvrirPhoto={setPinPhotoOuvert}
            formulaireOuvert={formulaireOuvert}
            onToggleFormulaire={setFormulaireOuvert}
            signalementOuvert={signalementOuvert}
            onToggleSignalement={setSignalementOuvert}
            nbACompleter={nbACompleter}
            estAdmin={estAdmin}
            filtreACompleter={filtreACompleter}
            onToggleFiltreACompleter={() => setFiltreACompleter((v) => !v)}
          />
        ) : (
          <VueCatalogue
            pins={pinsAffiches}
            chargement={chargementPins}
            recherche={recherche}
            onChangeRecherche={setRecherche}
            caseFiltre={caseFiltre}
            onChangeCaseFiltre={setCaseFiltre}
            attributionsParPin={attributionsParPin}
            onOuvrirDetail={setPinOuvert}
            onOuvrirPhoto={setPinPhotoOuvert}
            formulaireOuvert={formulaireOuvert}
            onToggleFormulaire={setFormulaireOuvert}
            signalementOuvert={signalementOuvert}
            onToggleSignalement={setSignalementOuvert}
            nbACompleter={nbACompleter}
            estAdmin={estAdmin}
            filtreACompleter={filtreACompleter}
            onToggleFiltreACompleter={() => setFiltreACompleter((v) => !v)}
          />
        )
      ) : vue === 'local' ? (
        <VueLocal
          pins={pins ?? []}
          chargement={chargementPins}
          recherche={rechercheLocal}
          onChangeRecherche={setRechercheLocal}
          demandesParPin={demandesParPin}
          onPeser={setPinAPeser}
        />
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {vue === 'boites' && (
            <>
              <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">Pop-up</Text>
              <View className="mb-4">
                <Dropdown
                  value={popUpActif}
                  options={popUps.map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
                  onChange={setPopUpId}
                />
              </View>

              {!popUpActif ? (
                <Text className="text-sm text-slate-400">
                  Aucun lieu attribué pour l'instant — demande à un admin de t'en attribuer un.
                </Text>
              ) : chargementGrille ? (
                <ActivityIndicator color="#6366F1" />
              ) : (
                <GrilleCases grille={grille ?? []} onPressCase={setCasePositionOuverte} />
              )}
            </>
          )}
          {vue === 'rapport' && (
            <>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase text-slate-400">
                  Remplissages — {popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
                </Text>
                {estAdmin && popUpActif && (
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setHistoriqueOuvert(true)}
                      className="rounded-lg bg-slate-100 px-3 py-1.5"
                    >
                      <Text className="text-xs font-semibold text-slate-600">Historique</Text>
                    </Pressable>
                    <Pressable onPress={() => setCommandeOuverte(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5">
                      <Text className="text-xs font-semibold text-white">Voir la commande</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              {!popUpActif ? (
                <Text className="text-sm text-slate-400">
                  Aucun lieu attribué pour l'instant — demande à un admin de t'en attribuer un.
                </Text>
              ) : chargementRapport ? (
                <ActivityIndicator color="#6366F1" />
              ) : (
                <RapportRemplissages
                  remplissagesParJour={remplissagesParJour}
                  estAdmin={estAdmin}
                  onPressBoite={setCasePositionOuverte}
                  onSupprimer={(id) =>
                    supprimerRemplissage.mutate(id, {
                      onError: (e) =>
                        Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de supprimer.'),
                    })
                  }
                />
              )}
            </>
          )}
        </ScrollView>
      )}

      {casePositionOuverte && popUpActif && (
        <CaseDetailModal
          casePosition={casePositionOuverte}
          contenus={contenusOuverts}
          pins={pins ?? []}
          attribuerEnCours={attribuer.isPending}
          onClose={() => setCasePositionOuverte(null)}
          onAttribuer={(pinIdsVoulus) => {
            attribuer.mutate(
              {
                casePosition: casePositionOuverte,
                pinIdsActuels: contenusOuverts.map((c) => c.pin.id),
                pinIdsVoulus,
                profileId: profile.id,
              },
              { onSuccess: () => setCasePositionOuverte(null) },
            );
          }}
          basculerCommandeEnCours={basculerCommande.isPending ? basculerCommande.variables?.boiteId : null}
          onBasculerCommande={(pinId, aCommander) => {
            const contenu = contenusOuverts.find((c) => c.pin.id === pinId);
            if (!contenu) return;
            basculerCommande.mutate(
              { boiteId: contenu.boiteId, aCommander, profileId: profile.id },
              { onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible d\'enregistrer.') },
            );
          }}
          dernierRemplissage={derniersRemplissages?.find((r) => r.casePosition === casePositionOuverte)}
          remplissageEnCours={validerRemplissage.isPending}
          onValiderRemplissage={() =>
            validerRemplissage.mutate(
              { casePosition: casePositionOuverte, profileId: profile.id },
              { onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de valider.') },
            )
          }
        />
      )}

      {pinOuvert && <PanneauPin pin={pinOuvert} profile={profile} onFermer={() => setPinOuvert(null)} />}

      {pinAPeser && popUpLocal && (
        <PanneauPesee
          pin={pinAPeser}
          popUpLocalId={popUpLocal.id}
          profile={profile}
          onFermer={() => setPinAPeser(null)}
        />
      )}

      {pinPhotoOuvert && <ModalePhotoPin pin={pinPhotoOuvert} onFermer={() => setPinPhotoOuvert(null)} />}

      {commandeOuverte && popUpActif && (
        <PanneauCommande
          lignes={commandeLignes}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          enCours={validerCommandes.isPending}
          onValider={(resultats) =>
            validerCommandes.mutate(
              { profileId: profile.id, resultats },
              {
                onSuccess: () => setCommandeOuverte(false),
                onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de valider.'),
              },
            )
          }
          onFermer={() => setCommandeOuverte(false)}
        />
      )}

      {historiqueOuvert && popUpActif && (
        <PanneauHistoriqueCommandes
          lignes={historiqueCommandes ?? []}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          onFermer={() => setHistoriqueOuvert(false)}
        />
      )}
    </View>
  );
}
