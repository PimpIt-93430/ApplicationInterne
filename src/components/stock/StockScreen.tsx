import { memo, useMemo, useState } from 'react';
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
  formatEmplacement,
  POSITIONS_GRILLE,
  uploaderPhotoPin,
  type CommandeHistoriqueResume,
  type CommandeResume,
  type DernierRemplissage,
  type LigneCommande,
} from '@/api/stock';
import { CaseDetailModal } from '@/components/stock/CaseDetailModal';
import { GrilleCases } from '@/components/stock/GrilleCases';
import { ModalePhotoPin } from '@/components/stock/ModalePhotoPin';
import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { BarreOnglets } from '@/components/ui/BarreOnglets';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import {
  useAttributionsPins,
  useCommandeActivePopUp,
  useCommandeDetail,
  useCommandesEnAttenteLocal,
  useCommandesTerminees,
  useDerniersRemplissages,
  useGererCasesPopUp,
  useGererCatalogue,
  useGererCommandePopUp,
  useGererPreparationCommande,
  useGrillePopUp,
  useMouvements,
  useRemplissages,
  usePins,
} from '@/hooks/useStock';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import type { Profile, StockPin } from '@/types/database.types';

/** Fiche détail d'un pin, ouverte depuis le catalogue : uniquement poids unité (édition), seuil
 * cible/quantité de réapprovisionnement (édition) et historique des mouvements — le reste (nom,
 * fournisseur, stock général, taille, ajustement manuel du stock) a été volontairement retiré. */
function PanneauPin({ pin, onFermer }: { pin: StockPin; onFermer: () => void }) {
  const { modifier } = useGererCatalogue();
  const { data: mouvements } = useMouvements({ pinId: pin.id });

  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));
  // `poids_unitaire` est le poids d'une seule unité (g) — pas de conversion, cf. retour
  // utilisateur : plus de convention "poids d'un lot de 10" (source de confusion).
  const [poidsUnite, setPoidsUnite] = useState(pin.poids_unitaire !== null ? String(pin.poids_unitaire) : '');

  const enregistrerSeuil = () => {
    const valeur = seuil.trim() === '' ? null : Number(seuil);
    if (valeur === pin.seuil_cible) return;
    modifier.mutate({ id: pin.id, params: { seuil_cible: valeur } });
  };

  const enregistrerPoids = () => {
    const brut = poidsUnite.trim() === '' ? null : Number(poidsUnite.replace(',', '.'));
    if (brut !== null && !Number.isFinite(brut)) return;
    if (brut === pin.poids_unitaire) return;
    modifier.mutate({ id: pin.id, params: { poids_unitaire: brut } });
  };

  return (
    <FeuilleModale onClose={onFermer}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text className="mb-4 text-lg font-bold text-slate-900">{pin.nom}</Text>

        <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Poids unité (g)</Text>
        <TextInput
          value={poidsUnite}
          onChangeText={setPoidsUnite}
          onEndEditing={enregistrerPoids}
          keyboardType="decimal-pad"
          placeholder="—"
          className={`mb-4 rounded-xl border px-3 py-2.5 ${
            pin.poids_unitaire === null ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200'
          }`}
        />

        <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">
          Seuil cible (quantité de réapprovisionnement)
        </Text>
        <TextInput
          value={seuil}
          onChangeText={setSeuil}
          onEndEditing={enregistrerSeuil}
          keyboardType="numeric"
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
        <Text className="text-[10px] font-semibold text-emerald-700">Attribué</Text>
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
  filtreAttribution,
  onChangeFiltreAttribution,
  attributionsParPin,
  onOuvrirDetail,
  onOuvrirPhoto,
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
          <Text className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Attribution</Text>
          <View className="mb-3">
            <FiltreAttribution valeur={filtreAttribution} onChange={onChangeFiltreAttribution} />
          </View>
          <Text className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Filtrer par case</Text>
          <FiltreCase valeur={caseFiltre} onChange={onChangeCaseFiltre} />
        </>
      }
      ListEmptyComponent={
        !chargement ? <Text className="mb-3 text-sm text-slate-400">Aucun résultat.</Text> : null
      }
      ListFooterComponent={
        signalementOuvert ? (
          <FormulaireSignalementPin onFermer={() => onToggleSignalement(false)} />
        ) : (
          <Pressable
            onPress={() => onToggleSignalement(true)}
            className="mb-6 items-center rounded-2xl border border-dashed border-amber-300 bg-white py-3"
          >
            <Text className="text-sm font-semibold text-amber-600">📷 Signaler un pin inconnu</Text>
          </Pressable>
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

  return (
    <View className="w-[10%] p-1.5">
      <View className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <Pressable onPress={onOuvrirPhoto} className="aspect-square w-full items-center justify-center bg-slate-50">
          {pin.photo_url ? (
            <Image source={{ uri: pin.photo_url }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <Text className="text-xs text-slate-400">?</Text>
          )}
        </Pressable>
        <Pressable onPress={onOuvrirDetail} className="px-2.5 pt-2.5">
          <Text numberOfLines={1} className="text-xs font-semibold text-slate-800">
            {pin.nom}
          </Text>
        </Pressable>
        <View className="flex-row items-center gap-1.5 px-2.5 pb-1.5 pt-2">
          <Text className="text-[10px] text-slate-400">Seuil</Text>
          <TextInput
            value={seuil}
            onChangeText={setSeuil}
            onEndEditing={enregistrerSeuil}
            keyboardType="numeric"
            placeholder="—"
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
          />
        </View>
        <View className="px-2.5 pb-2.5 pt-0.5">
          <View
            className={`self-start rounded-full px-2 py-0.5 ${
              attributions.length > 0 ? 'bg-emerald-50' : 'bg-slate-100'
            }`}
          >
            <Text
              numberOfLines={1}
              className={`text-[10px] font-semibold ${
                attributions.length > 0 ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              {attributions.length > 0
                ? attributions.map((a) => `${a.popUpNom} ${a.casePosition}`).join(' · ')
                : 'Non attribué'}
            </Text>
          </View>
          {pin.a_completer && <Text className="mt-1 text-[10px] font-bold text-amber-600">À compléter</Text>}
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
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-slate-900">Catalogue</Text>
            <Pressable
              onPress={() => onToggleSignalement(!signalementOuvert)}
              className="rounded-xl border border-dashed border-amber-300 bg-white px-3.5 py-2.5 shadow-sm"
            >
              <Text className="text-xs font-semibold text-amber-600">📷 Signaler un pin inconnu</Text>
            </Pressable>
          </View>

          {signalementOuvert && <FormulaireSignalementPin onFermer={() => onToggleSignalement(false)} />}

          {estAdmin && nbACompleter > 0 && (
            <Pressable
              onPress={onToggleFiltreACompleter}
              className={`mb-4 flex-row items-center justify-between rounded-2xl px-4 py-3 shadow-sm ${
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

          <View className="mb-5 gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <TextInput
              value={recherche}
              onChangeText={onChangeRecherche}
              placeholder={chargement ? 'Chargement…' : 'Rechercher un pin…'}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
            />

            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Attribution
              </Text>
              <FiltreAttribution valeur={filtreAttribution} onChange={onChangeFiltreAttribution} />
            </View>

            <View>
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Filtrer par case
              </Text>
              <FiltreCase valeur={caseFiltre} onChange={onChangeCaseFiltre} />
            </View>
          </View>
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
  peutSupprimer,
  onPressBoite,
  onSupprimer,
}: {
  remplissagesParJour: GroupeJourRemplissages[];
  peutSupprimer: boolean;
  onPressBoite: (casePosition: string) => void;
  onSupprimer: (id: string) => void;
}) {
  if (remplissagesParJour.length === 0) {
    return (
      <Text className="text-sm text-slate-400">Aucun remplissage enregistré pour l'instant sur ce pop-up.</Text>
    );
  }

  return (
    <View className="rounded-2xl border border-slate-100 bg-white px-3.5 py-1">
      {remplissagesParJour.map((jour, indexJour) => (
        <View
          key={jour.jourISO}
          className={indexJour > 0 ? 'mt-2 border-t border-slate-100 pt-2' : ''}
        >
          <Text className="mb-1 text-xs font-bold capitalize text-slate-400">
            {format(parseISO(jour.jourISO), 'EEE d MMM', { locale: fr })}
          </Text>
          {jour.lignes.map((ligne, indexLigne) => (
            <Pressable
              key={ligne.id}
              onPress={() => onPressBoite(ligne.casePosition)}
              className={`flex-row items-center justify-between py-1.5 ${
                indexLigne < jour.lignes.length - 1 ? 'border-b border-slate-50' : ''
              }`}
            >
              <Text className="text-xs font-semibold text-slate-700">Boîte {ligne.casePosition}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-[11px] text-slate-400">
                  {ligne.profileNom} · {format(new Date(ligne.createdAt), 'HH:mm')}
                </Text>
                {peutSupprimer && (
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
                    className="pl-2"
                  >
                    <Text className="text-[11px] font-semibold text-red-500">✕</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Aperçu de la commande avant envoi : pins signalés "à commander" sur les boîtes de ce pop-up,
 * tant que rien n'a encore été envoyé au local. Chaque pin est coché par défaut ; décocher un pin
 * l'exclut de cet envoi (il reste "à commander" et repartira dans une prochaine commande) — utile
 * pour ne pas tout envoyer d'un coup. Une fois envoyée, c'est le local qui décide pin par pin ce
 * qu'il a effectivement préparé (plus de coche "trouvé" ici). */
function PanneauCommande({
  lignes,
  popUpNom,
  enCours,
  pinIdsInitialementCoches,
  onBasculerImmediat,
  onEnvoyer,
  onAnnuler,
  annulationEnCours,
  onFermer,
}: {
  lignes: LigneCommande[];
  popUpNom: string;
  enCours: boolean;
  /** Fourni en mode "modifier une commande déjà envoyée" : seuls ces pins démarrent cochés (le
   * reste de la liste peut inclure des pins nouvellement signalés "à commander" depuis l'envoi).
   * Absent en mode création : tout démarre coché (comportement historique). */
  pinIdsInitialementCoches?: string[];
  /** Mode modification uniquement : enregistre chaque coche tout de suite en base (pas seulement
   * au clic sur un bouton) — si la personne quitte le panneau par erreur en cours de route, rien
   * n'est perdu. `onEnvoyer` n'est alors jamais appelé. */
  onBasculerImmediat?: (pinId: string, inclus: boolean) => void;
  onEnvoyer?: (pinIds: string[]) => void;
  /** Mode modification uniquement : annule l'envoi (commande + lignes supprimées, pins remis "à
   * commander" — déjà le cas puisque l'envoi ne les avait jamais retirés). */
  onAnnuler?: () => void;
  annulationEnCours?: boolean;
  onFermer: () => void;
}) {
  const modeModification = pinIdsInitialementCoches !== undefined;

  const [pinsExclus, setPinsExclus] = useState<Set<string>>(() =>
    pinIdsInitialementCoches
      ? new Set(
          lignes.filter((l) => !pinIdsInitialementCoches.includes(l.pin.id)).map((l) => l.pin.id),
        )
      : new Set(),
  );

  const lignesRetenues = lignes.filter((l) => !pinsExclus.has(l.pin.id));

  const basculerPin = (pinId: string) => {
    let inclusApres = false;
    setPinsExclus((prev) => {
      const next = new Set(prev);
      if (next.has(pinId)) {
        next.delete(pinId);
        inclusApres = true;
      } else {
        next.add(pinId);
        inclusApres = false;
      }
      return next;
    });
    onBasculerImmediat?.(pinId, inclusApres);
  };

  const toutSelectionner = () => {
    if (modeModification) {
      // Sauvegarde tout de suite chaque pin pas encore inclus (les autres le sont déjà).
      for (const ligne of lignes) {
        if (pinsExclus.has(ligne.pin.id)) onBasculerImmediat?.(ligne.pin.id, true);
      }
    }
    setPinsExclus(new Set());
  };

  const confirmerEnvoi = () => {
    Alert.alert(
      'Envoyer la commande au local',
      `Le local va préparer ces pins pour ${popUpNom}. Tu ne pourras pas envoyer de nouvelle commande tant que celle-ci n'est pas reçue.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Envoyer', onPress: () => onEnvoyer?.(lignesRetenues.map((l) => l.pin.id)) },
      ],
    );
  };

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-1 text-lg font-bold text-slate-900">Commande — {popUpNom}</Text>
      <Text className="mb-2 text-sm text-slate-400">
        {modeModification
          ? 'La commande est encore modifiable tant que le local ne l\'a pas prise en charge. Coche/décoche pour ajuster les pins envoyés — chaque changement est enregistré tout de suite.'
          : 'Pins signalés "à commander" sur les boîtes de ce pop-up. Décoche ceux à ne pas envoyer tout de suite — ils resteront "à commander" pour une prochaine fois.'}
      </Text>

      {lignes.length > 0 && (
        <Pressable onPress={toutSelectionner} className="mb-3 self-start">
          <Text className="text-sm font-semibold text-indigo-600">Tout sélectionner</Text>
        </Pressable>
      )}

      <ScrollView style={{ maxHeight: 480 }}>
        {lignes.length === 0 ? (
          <Text className="text-sm text-slate-400">Rien à commander pour l'instant.</Text>
        ) : (
          lignes.map((ligne) => {
            const retenu = !pinsExclus.has(ligne.pin.id);
            return (
              <Pressable
                key={ligne.pin.id}
                onPress={() => basculerPin(ligne.pin.id)}
                className="mb-2 flex-row items-center gap-3 rounded-xl bg-slate-50 p-2"
              >
                {ligne.pin.photo_url ? (
                  <Image
                    source={{ uri: ligne.pin.photo_url }}
                    className="h-14 w-14 rounded-lg bg-slate-100"
                  />
                ) : (
                  <View className="h-14 w-14 items-center justify-center rounded-lg bg-slate-100">
                    <Text className="text-lg text-slate-300">?</Text>
                  </View>
                )}
                <Text numberOfLines={2} className="flex-1 text-sm font-semibold text-slate-800">
                  {ligne.pin.nom}
                </Text>
                <Text className="text-xs text-slate-400">{ligne.nbBoites} boîte(s)</Text>
                <View
                  className={`h-7 w-7 items-center justify-center rounded-md border-2 ${
                    retenu ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                  }`}
                >
                  {retenu && <Text className="text-xs font-bold text-white">✓</Text>}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {modeModification ? (
        <>
          <Pressable onPress={onFermer} className="mt-4 items-center rounded-xl bg-slate-100 py-3.5">
            <Text className="text-base font-bold text-slate-700">Terminé</Text>
          </Pressable>
          {onAnnuler && (
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Annuler l'envoi",
                  "La commande sera supprimée — les pins resteront marqués \"à commander\" et tu pourras renvoyer une commande normalement.",
                  [
                    { text: 'Retour', style: 'cancel' },
                    { text: "Annuler l'envoi", style: 'destructive', onPress: onAnnuler },
                  ],
                )
              }
              disabled={annulationEnCours}
              className="mt-3 items-center py-2"
            >
              <Text className="text-sm font-semibold text-red-600">
                {annulationEnCours ? 'Annulation…' : "Annuler l'envoi de la commande"}
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <Pressable
          onPress={confirmerEnvoi}
          disabled={enCours || lignesRetenues.length === 0}
          className={`mt-4 items-center rounded-xl py-3.5 ${lignesRetenues.length === 0 ? 'bg-slate-200' : 'bg-emerald-500'}`}
        >
          <Text className={`text-base font-bold ${lignesRetenues.length === 0 ? 'text-slate-500' : 'text-white'}`}>
            {enCours
              ? 'Envoi…'
              : `Envoyer la commande${lignesRetenues.length > 0 ? ` (${lignesRetenues.length})` : ''}`}
          </Text>
        </Pressable>
      )}
      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
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

function LigneLocalPin({
  pin,
  demandeurs,
  popUpLocalId,
  profileId,
}: {
  pin: StockPin;
  demandeurs: PopUpDemandeur[];
  popUpLocalId: string | undefined;
  profileId: string;
}) {
  const enRupture = pin.seuil_cible !== null && pin.stock_general < pin.seuil_cible;
  const { peser } = useGererCatalogue();
  // Champ de pesée toujours affiché (pas de bouton "Peser" à presser d'abord, cf. retour
  // utilisateur) — permet d'enchaîner vite plusieurs pesées d'affilée pin après pin.
  const [poids, setPoids] = useState('');

  const poidsNum = Number(poids.trim().replace(',', '.'));
  const poidsValide = poids.trim() !== '' && Number.isFinite(poidsNum) && poidsNum >= 0;

  const confirmer = () => {
    if (!poidsValide || !popUpLocalId) return;
    peser.mutate(
      { pinId: pin.id, popUpLocalId, poidsPese: poidsNum, profileId },
      {
        onSuccess: () => setPoids(''),
        onError: (e) =>
          Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer la pesée."),
      },
    );
  };

  return (
    <View
      className={`mb-2.5 flex-row items-center gap-3 rounded-2xl p-3 shadow-sm ${
        enRupture ? 'border border-red-200 bg-red-50' : 'border border-slate-100 bg-white'
      }`}
    >
      {pin.photo_url ? (
        <Image source={{ uri: pin.photo_url }} className="h-12 w-12 rounded-xl bg-slate-100" />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <Text className="text-xs text-slate-300">?</Text>
        </View>
      )}
      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-semibold text-slate-800">
          {pin.nom}
        </Text>
        <Text className="text-[11px] text-slate-400">
          SKU {pin.sku_pimpit ?? pin.sku_fournisseur ?? '—'}
          {formatEmplacement(pin) ? ` · ${formatEmplacement(pin)}` : ''}
        </Text>
        <Text className={`text-xs ${enRupture ? 'font-bold text-red-600' : 'text-slate-400'}`}>
          {pin.stock_general} en stock{pin.seuil_cible !== null ? ` · seuil ${pin.seuil_cible}` : ''}
        </Text>
        {demandeurs.length > 0 && (
          <Text numberOfLines={1} className="text-[11px] text-amber-600">
            Demandé par {demandeurs.map((d) => d.popUpNom).join(', ')}
          </Text>
        )}
        {pin.poids_unitaire === null && (
          <Text className="mt-1 text-[11px] text-amber-600">
            Poids unité (g) manquant — à renseigner dans Catalogue avant de peser.
          </Text>
        )}
      </View>
      {pin.poids_unitaire !== null && (
        <View className="flex-row items-center gap-1.5">
          <TextInput
            value={poids}
            onChangeText={setPoids}
            keyboardType="decimal-pad"
            placeholder="Poids (g)"
            onSubmitEditing={confirmer}
            className="w-20 rounded-xl border border-slate-200 px-2.5 py-2 text-sm"
          />
          <Pressable
            onPress={confirmer}
            disabled={!poidsValide || peser.isPending}
            className={`items-center justify-center rounded-xl px-3 py-2 ${poidsValide ? 'bg-indigo-600' : 'bg-slate-200'}`}
          >
            <Text className={`text-xs font-bold ${poidsValide ? 'text-white' : 'text-slate-500'}`}>OK</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function VueLocal({
  pins,
  chargement,
  recherche,
  onChangeRecherche,
  demandesParPin,
  popUpLocalId,
  profileId,
}: {
  pins: StockPin[];
  chargement: boolean;
  recherche: string;
  onChangeRecherche: (v: string) => void;
  demandesParPin: Map<string, PopUpDemandeur[]>;
  popUpLocalId: string | undefined;
  profileId: string;
}) {
  const pinsTries = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = q ? pins.filter((p) => p.nom.toLowerCase().includes(q)) : pins;
    // Trié par SKU (pas par urgence) — l'ordre suit le classement physique du local, plus facile
    // à parcourir pin en main. Sans SKU, la ligne passe en fin de liste plutôt que de perturber
    // l'ordre des autres.
    return [...liste].sort((a, b) => {
      const skuA = a.sku_pimpit ?? a.sku_fournisseur;
      const skuB = b.sku_pimpit ?? b.sku_fournisseur;
      if (skuA && skuB) return skuA.localeCompare(skuB, undefined, { numeric: true });
      if (skuA) return -1;
      if (skuB) return 1;
      return a.nom.localeCompare(b.nom);
    });
  }, [pins, recherche]);

  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 40,
        maxWidth: 960,
        width: '100%',
        alignSelf: 'center',
      }}
      keyboardShouldPersistTaps="handled"
      data={pinsTries}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <LigneLocalPin
          pin={item}
          demandeurs={demandesParPin.get(item.id) ?? []}
          popUpLocalId={popUpLocalId}
          profileId={profileId}
        />
      )}
      ListHeaderComponent={
        <>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Stock local
          </Text>
          <Text className="mb-3 text-xs text-slate-400">
            En rouge : sous le seuil cible. "Demandé par" : au moins une case pop-up a coché
            "Commander" pour ce pin. Pèse ce qu'il reste après avoir servi une commande pour
            recalculer le stock automatiquement.
          </Text>
          <TextInput
            value={recherche}
            onChangeText={onChangeRecherche}
            placeholder={chargement ? 'Chargement…' : 'Rechercher un pin à peser…'}
            className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          />
        </>
      }
      ListEmptyComponent={
        !chargement ? <Text className="mb-3 text-sm text-slate-400">Aucun résultat.</Text> : null
      }
    />
  );
}

function BadgeStatutCommande({ statut }: { statut: 'envoyee' | 'prete' }) {
  if (statut === 'envoyee') {
    return (
      <View className="self-start rounded-full bg-amber-100 px-2.5 py-1">
        <Text className="text-[10px] font-semibold text-amber-700">À préparer</Text>
      </View>
    );
  }
  return (
    <View className="self-start rounded-full bg-emerald-100 px-2.5 py-1">
      <Text className="text-[10px] font-semibold text-emerald-700">Prête</Text>
    </View>
  );
}

function LigneCommandeLocal({ resume, onOuvrir }: { resume: CommandeResume; onOuvrir: () => void }) {
  return (
    <Pressable
      onPress={onOuvrir}
      className="mb-2.5 flex-row items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
    >
      <View className="flex-1">
        <Text className="text-sm font-semibold text-slate-800">{resume.popUpNom}</Text>
        <Text className="mt-0.5 text-xs text-slate-400">
          {resume.nbFaites}/{resume.nbLignes} pin(s) prêt(s) · envoyée{' '}
          {format(new Date(resume.commande.envoyee_at), 'dd/MM HH:mm')}
        </Text>
      </View>
      <BadgeStatutCommande statut={resume.commande.statut === 'prete' ? 'prete' : 'envoyee'} />
      <Text className="ml-3 text-lg text-indigo-400">›</Text>
    </Pressable>
  );
}

/** Onglet "Commandes" du Local : toutes les commandes envoyées par les pop-ups, à préparer puis
 * valider comme prêtes. */
function VueCommandesLocal({ onOuvrirCommande }: { onOuvrirCommande: (commandeId: string) => void }) {
  const { data: commandes, isLoading } = useCommandesEnAttenteLocal();

  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 40,
        maxWidth: 960,
        width: '100%',
        alignSelf: 'center',
      }}
      data={commandes ?? []}
      keyExtractor={(c) => c.commande.id}
      renderItem={({ item }) => (
        <LigneCommandeLocal resume={item} onOuvrir={() => onOuvrirCommande(item.commande.id)} />
      )}
      ListHeaderComponent={
        <>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Commandes
          </Text>
          <Text className="mb-3 text-xs text-slate-400">
            Commandes envoyées par les pop-ups. Pèse chaque pin (ça coche automatiquement la case),
            puis valide la commande comme prête — le pop-up sera prévenu qu'il peut venir la
            récupérer.
          </Text>
        </>
      }
      ListEmptyComponent={
        !isLoading ? (
          <Text className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            Aucune commande en attente.
          </Text>
        ) : null
      }
    />
  );
}

/** Mémoïsé : avec le patch de cache ciblé de useCommandeDetail/useGererPreparationCommande, seule
 * la ligne dont "fait" change reçoit une nouvelle prop `ligne` — les autres gardent la même
 * référence et ne re-rendent pas (évite de faire clignoter/recharger toutes les photos à chaque
 * coche, qui était la source du lag signalé). */
const LignePreparationCommande = memo(function LignePreparationCommande({
  ligne,
  onBasculerFait,
}: {
  ligne: { id: string; fait: boolean; pin: StockPin };
  onBasculerFait: (fait: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onBasculerFait(!ligne.fait)}
      className={`mb-2 flex-row items-center gap-3 rounded-xl p-2 ${ligne.fait ? 'bg-emerald-50' : 'bg-slate-50'}`}
    >
      {ligne.pin.photo_url ? (
        <Image source={{ uri: ligne.pin.photo_url }} className="h-14 w-14 rounded-lg bg-slate-100" />
      ) : (
        <View className="h-14 w-14 items-center justify-center rounded-lg bg-slate-100">
          <Text className="text-lg text-slate-300">?</Text>
        </View>
      )}
      <View className="flex-1">
        <Text
          numberOfLines={1}
          className={`text-sm font-semibold ${ligne.fait ? 'text-slate-400 line-through' : 'text-slate-800'}`}
        >
          {ligne.pin.nom}
        </Text>
        <Text className="text-xs text-slate-400">
          SKU {ligne.pin.sku_pimpit ?? ligne.pin.sku_fournisseur ?? '—'}
          {formatEmplacement(ligne.pin) ? ` · ${formatEmplacement(ligne.pin)}` : ''}
        </Text>
      </View>
      <View
        className={`h-7 w-7 items-center justify-center rounded-md border-2 ${
          ligne.fait ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
        }`}
      >
        {ligne.fait && <Text className="text-xs font-bold text-white">✓</Text>}
      </View>
    </Pressable>
  );
});

/** Écran de préparation d'une commande (Local) : coche chaque pin (photo, SKU, bac) — un par un ou
 * tous d'un coup — puis valide comme prête. Historise trouvé/pas trouvé pin par pin (alimente
 * l'ajustement auto de seuil_cible) et prévient le pop-up. */
function PanneauPreparationCommande({
  commandeId,
  profile,
  basculerFait,
  basculerTout,
  validerPrete,
  onFermer,
}: {
  commandeId: string;
  profile: Profile;
  basculerFait: ReturnType<typeof useGererPreparationCommande>['basculerFait'];
  basculerTout: ReturnType<typeof useGererPreparationCommande>['basculerTout'];
  validerPrete: ReturnType<typeof useGererPreparationCommande>['validerPrete'];
  onFermer: () => void;
}) {
  const { data } = useCommandeDetail(commandeId);

  if (!data) {
    return (
      <FeuilleModale onClose={onFermer}>
        <ActivityIndicator color="#6366F1" />
      </FeuilleModale>
    );
  }

  const { commande, popUpNom, lignes } = data;
  const dejaPrete = commande.statut === 'prete';

  const confirmerValidation = () => {
    Alert.alert(
      'Valider la commande comme prête',
      `${popUpNom} sera prévenu que la commande est prête à récupérer. Les pins non cochés seront enregistrés comme non trouvés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: () =>
            validerPrete.mutate(
              {
                commandeId,
                popUpId: commande.pop_up_id,
                profileId: profile.id,
                lignes: lignes.map((l) => ({ pinId: l.pin_id, fait: l.fait })),
              },
              {
                onSuccess: onFermer,
                onError: (e) =>
                  Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de valider.'),
              },
            ),
        },
      ],
    );
  };

  return (
    <FeuilleModale onClose={onFermer}>
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-lg font-bold text-slate-900">Commande — {popUpNom}</Text>
          <Text className="text-sm text-slate-400">Prépare chaque pin (photo, SKU, bac) puis coche-le.</Text>
        </View>
        <Pressable
          onPress={() => basculerTout.mutate({ commandeId, fait: true })}
          disabled={basculerTout.isPending}
          className="items-center rounded-lg bg-indigo-50 px-3 py-2"
        >
          <Text className="text-xs font-bold text-indigo-600">Tout cocher</Text>
        </Pressable>
      </View>

      <ScrollView style={{ maxHeight: 420 }}>
        {lignes.map((ligne) => (
          <LignePreparationCommande
            key={ligne.id}
            ligne={ligne}
            onBasculerFait={(fait) => basculerFait.mutate({ ligneId: ligne.id, commandeId, fait })}
          />
        ))}
      </ScrollView>

      {!dejaPrete && (
        <Pressable
          onPress={confirmerValidation}
          disabled={validerPrete.isPending}
          className="mt-4 items-center rounded-xl bg-emerald-500 py-3.5"
        >
          <Text className="text-base font-bold text-white">
            {validerPrete.isPending ? 'Validation…' : 'Valider la commande'}
          </Text>
        </Pressable>
      )}
      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}

/** Liste des commandes passées d'un pop-up (date + nombre de pins) — onglet "Historique", tap pour
 * voir le détail (quels pins, trouvés ou pas) via PanneauDetailCommandeHistorique. */
function VueHistoriqueCommandes({
  commandes,
  onOuvrir,
}: {
  commandes: CommandeHistoriqueResume[];
  onOuvrir: (commandeId: string) => void;
}) {
  if (commandes.length === 0) {
    return <Text className="text-sm text-slate-400">Aucune commande pour l'instant sur ce pop-up.</Text>;
  }

  return (
    <>
      {commandes.map(({ commande, nbPins }) => (
        <Pressable
          key={commande.id}
          onPress={() => onOuvrir(commande.id)}
          className="mb-2.5 flex-row items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
        >
          <View>
            <Text className="text-sm font-semibold capitalize text-slate-800">
              {format(new Date(commande.envoyee_at), 'EEEE d MMMM yyyy', { locale: fr })}
            </Text>
            <Text className="mt-0.5 text-xs text-slate-400">
              {nbPins} pin{nbPins > 1 ? 's' : ''} commandé{nbPins > 1 ? 's' : ''}
            </Text>
          </View>
          <Text className="text-lg text-indigo-400">›</Text>
        </Pressable>
      ))}
    </>
  );
}

/** Détail d'une commande passée : quels pins, trouvés ou pas au moment de la préparation par le
 * local. Un admin peut aussi annuler l'envoi depuis ici tant que le local ne l'a pas encore prise
 * en charge (statut "envoyee") — même règle et même mutation que le bouton "Modifier" côté
 * pop-up, seulement accessible en plus depuis l'Historique pour un admin qui doit rattraper un
 * envoi fait par erreur. */
function PanneauDetailCommandeHistorique({
  commandeId,
  estAdmin,
  onAnnuler,
  annulationEnCours,
  onFermer,
}: {
  commandeId: string;
  estAdmin: boolean;
  onAnnuler: () => void;
  annulationEnCours: boolean;
  onFermer: () => void;
}) {
  const { data } = useCommandeDetail(commandeId);

  if (!data) {
    return (
      <FeuilleModale onClose={onFermer}>
        <ActivityIndicator color="#6366F1" />
      </FeuilleModale>
    );
  }

  const { commande, popUpNom, lignes } = data;
  const peutAnnuler = estAdmin && commande.statut === 'envoyee';

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-1 text-lg font-bold text-slate-900">Commande — {popUpNom}</Text>
      <Text className="mb-4 text-sm capitalize text-slate-400">
        {format(new Date(commande.envoyee_at), 'EEEE d MMMM yyyy', { locale: fr })}
      </Text>

      <ScrollView style={{ maxHeight: 480 }}>
        {lignes.map((ligne) => (
          <View key={ligne.id} className="mb-2 flex-row items-center gap-3 rounded-xl bg-slate-50 p-2">
            {ligne.pin.photo_url ? (
              <Image source={{ uri: ligne.pin.photo_url }} className="h-12 w-12 rounded-lg bg-slate-100" />
            ) : (
              <View className="h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                <Text className="text-lg text-slate-300">?</Text>
              </View>
            )}
            <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-slate-800">
              {ligne.pin.nom}
            </Text>
            <Text className={`text-xs font-semibold ${ligne.fait ? 'text-emerald-600' : 'text-slate-400'}`}>
              {ligne.fait ? 'Trouvé' : 'Pas trouvé'}
            </Text>
          </View>
        ))}
      </ScrollView>

      {peutAnnuler && (
        <Pressable
          onPress={() =>
            Alert.alert('Annuler l\'envoi', 'Supprimer cette commande envoyée au local ?', [
              { text: 'Non', style: 'cancel' },
              { text: 'Oui, annuler', style: 'destructive', onPress: onAnnuler },
            ])
          }
          disabled={annulationEnCours}
          className="mt-3 items-center rounded-2xl bg-red-50 py-3"
        >
          <Text className="font-semibold text-red-600">
            {annulationEnCours ? 'Annulation…' : "Annuler l'envoi"}
          </Text>
        </Pressable>
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
export function StockScreen({
  profile,
  onRetour,
  popUpId,
  onChangePopUpId,
}: {
  profile: Profile;
  onRetour: () => void;
  // Contrôlé par l'écran parent (StockAccueil) pour qu'un admin garde le même lieu sélectionné en
  // passant de "Pin's" à "Consommables" — cf. discussion : un sélecteur par sous-écran qui oublie
  // le choix de l'autre est source de confusion.
  popUpId: string | undefined;
  onChangePopUpId: (id: string) => void;
}) {
  const estAdmin = profile.role === 'admin';
  // Un remplissage peut être ajouté par erreur (mauvaise boîte, appui accidentel) — un manager
  // peut le corriger lui-même, pas seulement un admin (cf. migration élargissant la policy RLS
  // correspondante), contrairement au reste du rapport qui reste en lecture seule pour lui.
  const peutSupprimerRemplissage = estAdmin || profile.type_contrat === 'manager';
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const { data: pins, isLoading: chargementPins } = usePins();
  const { data: attributions } = useAttributionsPins();

  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const popUps = estAdmin ? (popUpsTous ?? []) : popUpsAttribues(profile, mapAffectations, popUpsTous ?? []);

  const popUpActif = popUpId ?? popUps[0]?.id;

  const popUpLocal = useMemo(() => popUpsTous?.find((p) => p.est_local), [popUpsTous]);
  const estAuLocal = !!popUpLocal && (mapAffectations.get(profile.id)?.has(popUpLocal.id) ?? false);
  // Le Local n'a ni boîtes ni commande "à recevoir" comme un pop-up normal (cf. commentaire en tête
  // de fichier) : quand il est le lieu sélectionné (cf. roulette StockAccueil), l'écran bascule
  // entièrement sur ses propres onglets (Commandes/Stock local/Catalogue) plutôt que d'ajouter un
  // 4ᵉ onglet à côté de Boîtes/Catalogue/Historique qui ne le concernent pas.
  const estVueLocaleActive = !!popUpLocal && popUpActif === popUpLocal.id && (estAdmin || estAuLocal);

  const { data: grille, isLoading: chargementGrille } = useGrillePopUp(popUpActif);
  const { attribuer, basculerCommande, validerRemplissage, supprimerRemplissage } =
    useGererCasesPopUp(popUpActif);
  const { data: derniersRemplissages } = useDerniersRemplissages(popUpActif);
  const { data: remplissages, isLoading: chargementRapport } = useRemplissages(popUpActif);
  const { data: commandesTerminees, isLoading: chargementHistorique } = useCommandesTerminees(popUpActif);
  const { data: commandeActive } = useCommandeActivePopUp(popUpActif);
  const {
    envoyer: envoyerCommandeMutation,
    marquerRecue,
    basculerLigne: basculerLigneCommandeMutation,
    annuler: annulerCommandeMutation,
  } = useGererCommandePopUp(popUpActif);
  const { basculerFait, basculerTout, validerPrete } = useGererPreparationCommande();

  const [vue, setVue] = useState<'boites' | 'catalogue' | 'rapport'>('boites');
  const [sousOngletLocal, setSousOngletLocal] = useState<'commandes' | 'stock' | 'catalogue'>('commandes');
  const [commandeLocaleOuverte, setCommandeLocaleOuverte] = useState<string | null>(null);
  const [rechercheLocal, setRechercheLocal] = useState('');
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
  const [signalementOuvert, setSignalementOuvert] = useState(false);
  const [filtreACompleter, setFiltreACompleter] = useState(false);
  const [commandeOuverte, setCommandeOuverte] = useState(false);
  const [commandeModifOuverte, setCommandeModifOuverte] = useState(false);
  const [commandeHistoriqueOuverte, setCommandeHistoriqueOuverte] = useState<string | null>(null);

  const nbACompleter = useMemo(() => (pins ?? []).filter((p) => p.a_completer).length, [pins]);

  // Le catalogue n'affiche que l'attribution sur les pop-ups où LA PERSONNE QUI REGARDE travaille
  // (popUps = tous pour un admin, seulement ses lieux attribués sinon) — un alternant de Val
  // d'Europe ne doit pas voir "Attribué à Créteil Soleil", uniquement sa propre case si le pin y
  // est attribué.
  const attributionsParPin = useMemo(() => {
    const popUpIdsVisibles = new Set(popUps.map((p) => p.id));
    const map = new Map<string, AttributionAffichage[]>();
    for (const a of attributions ?? []) {
      if (!popUpIdsVisibles.has(a.pop_up_id)) continue;
      const popUpNom = popUpsTous?.find((p) => p.id === a.pop_up_id)?.nom ?? '?';
      const liste = map.get(a.pin_id) ?? [];
      liste.push({ popUpNom, casePosition: a.case_position });
      map.set(a.pin_id, liste);
    }
    return map;
  }, [attributions, popUpsTous, popUps]);

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

  // Pour modifier une commande déjà envoyée : ses pins actuels + les pins nouvellement signalés
  // "à commander" depuis l'envoi (pas encore dans la commande) — ces derniers démarrent décochés.
  const commandeLignesModifiables = useMemo(() => {
    if (!commandeActive) return [];
    const parPin = new Map(commandeLignes.map((l) => [l.pin.id, l]));
    for (const ligne of commandeActive.lignes) {
      if (!parPin.has(ligne.pin.id)) parPin.set(ligne.pin.id, { pin: ligne.pin, nbBoites: 0 });
    }
    return [...parPin.values()];
  }, [commandeActive, commandeLignes]);

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

      {estVueLocaleActive ? (
        // Le Local n'a ni boîtes ni "à recevoir" comme un pop-up normal : juste peser les pin's
        // pour ajuster le stock restant, voir les commandes des pop-ups, et un accès direct au
        // catalogue (avec "Signaler un pin inconnu" pour en ajouter un qui n'existe pas encore).
        <View className="flex-1">
          <View className="px-4 pt-4">
            <BarreOnglets
              valeur={sousOngletLocal}
              onChange={setSousOngletLocal}
              options={[
                { valeur: 'commandes', label: 'Commandes' },
                { valeur: 'stock', label: 'Stock local' },
                { valeur: 'catalogue', label: 'Catalogue', badge: estAdmin ? nbACompleter : 0 },
              ]}
            />
          </View>
          {sousOngletLocal === 'commandes' ? (
            <VueCommandesLocal onOuvrirCommande={setCommandeLocaleOuverte} />
          ) : sousOngletLocal === 'stock' ? (
            <VueLocal
              pins={pins ?? []}
              chargement={chargementPins}
              recherche={rechercheLocal}
              onChangeRecherche={setRechercheLocal}
              demandesParPin={demandesParPin}
              popUpLocalId={popUpLocal?.id}
              profileId={profile.id}
            />
          ) : Platform.OS === 'web' ? (
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
              filtreAttribution={filtreAttribution}
              onChangeFiltreAttribution={setFiltreAttribution}
              attributionsParPin={attributionsParPin}
              onOuvrirDetail={setPinOuvert}
              onOuvrirPhoto={setPinPhotoOuvert}
              signalementOuvert={signalementOuvert}
              onToggleSignalement={setSignalementOuvert}
              nbACompleter={nbACompleter}
              estAdmin={estAdmin}
              filtreACompleter={filtreACompleter}
              onToggleFiltreACompleter={() => setFiltreACompleter((v) => !v)}
            />
          )}
        </View>
      ) : (
        <>
          <View className="px-4 pt-4">
            <BarreOnglets
              valeur={vue}
              onChange={setVue}
              options={[
                { valeur: 'boites', label: 'Boîtes' },
                { valeur: 'catalogue', label: 'Catalogue', badge: estAdmin ? nbACompleter : 0 },
                { valeur: 'rapport', label: 'Historique' },
              ]}
            />
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
                filtreAttribution={filtreAttribution}
                onChangeFiltreAttribution={setFiltreAttribution}
                attributionsParPin={attributionsParPin}
                onOuvrirDetail={setPinOuvert}
                onOuvrirPhoto={setPinPhotoOuvert}
                signalementOuvert={signalementOuvert}
                onToggleSignalement={setSignalementOuvert}
                nbACompleter={nbACompleter}
                estAdmin={estAdmin}
                filtreACompleter={filtreACompleter}
                onToggleFiltreACompleter={() => setFiltreACompleter((v) => !v)}
              />
            )
          ) : (
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: 'center' }}
            >
            <View className="w-full max-w-[960px]">
              {vue === 'boites' && (
                <>
                  {/* Le choix du lieu se fait une seule fois en arrivant sur Stock (StockAccueil,
                      sélecteur partagé entre catégories) — ici juste un rappel du lieu actif, pas un
                      second sélecteur redondant. */}
                  <Text className="mb-5 text-xl font-bold text-slate-900">
                    {popUps.find((p) => p.id === popUpActif)?.nom ?? '—'}
                  </Text>

                  {!popUpActif ? (
                    <Text className="text-sm text-slate-400">
                      Aucun lieu attribué pour l'instant — demande à un admin de t'en attribuer un.
                    </Text>
                  ) : chargementGrille ? (
                    <ActivityIndicator color="#6366F1" />
                  ) : (
                    <>
                      <GrilleCases grille={grille ?? []} onPressCase={setCasePositionOuverte} />

                      {popUpActif && (
                        <View className="mt-5">
                          {!commandeActive ? (
                            <Pressable
                              onPress={() => setCommandeOuverte(true)}
                              className="items-center rounded-2xl bg-indigo-600 py-4"
                            >
                              <Text className="text-base font-bold text-white">Voir la commande</Text>
                            </Pressable>
                          ) : commandeActive.commande.statut === 'envoyee' ? (
                            <Pressable
                              onPress={() => setCommandeModifOuverte(true)}
                              className="items-center rounded-2xl bg-amber-100 py-4"
                            >
                              <Text className="text-sm font-semibold text-amber-700">
                                Commande envoyée le{' '}
                                {format(new Date(commandeActive.commande.envoyee_at), "d MMM 'à' HH:mm", {
                                  locale: fr,
                                })}{' '}
                                — en préparation · Modifier
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() =>
                                Alert.alert(
                                  'Commande reçue',
                                  'Confirmer que la commande a bien été récupérée au local ?',
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
                              className="items-center rounded-2xl bg-emerald-600 py-4"
                            >
                              <Text className="text-base font-bold text-white">
                                {marquerRecue.isPending ? 'Validation…' : 'Commande prête — Reçue ?'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      )}

                      <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Contrôle des boîtes
                      </Text>
                      {chargementRapport ? (
                        <ActivityIndicator color="#6366F1" />
                      ) : (
                        <RapportRemplissages
                          remplissagesParJour={remplissagesParJour}
                          peutSupprimer={peutSupprimerRemplissage}
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
                </>
              )}
              {vue === 'rapport' && (
                <>
                  {!popUpActif ? (
                    <Text className="text-sm text-slate-400">
                      Aucun lieu attribué pour l'instant — demande à un admin de t'en attribuer un.
                    </Text>
                  ) : chargementHistorique ? (
                    <ActivityIndicator color="#6366F1" />
                  ) : (
                    <VueHistoriqueCommandes
                      commandes={commandesTerminees ?? []}
                      onOuvrir={setCommandeHistoriqueOuverte}
                    />
                  )}
                </>
              )}
            </View>
            </ScrollView>
          )}
        </>
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

      {pinOuvert && <PanneauPin pin={pinOuvert} onFermer={() => setPinOuvert(null)} />}

      {commandeLocaleOuverte && (
        <PanneauPreparationCommande
          commandeId={commandeLocaleOuverte}
          profile={profile}
          basculerFait={basculerFait}
          basculerTout={basculerTout}
          validerPrete={validerPrete}
          onFermer={() => setCommandeLocaleOuverte(null)}
        />
      )}

      {pinPhotoOuvert && <ModalePhotoPin pin={pinPhotoOuvert} onFermer={() => setPinPhotoOuvert(null)} />}

      {commandeOuverte && popUpActif && (
        <PanneauCommande
          lignes={commandeLignes}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          enCours={envoyerCommandeMutation.isPending}
          onEnvoyer={(pinIds) =>
            envoyerCommandeMutation.mutate(
              { profileId: profile.id, pinIds },
              {
                onSuccess: () => setCommandeOuverte(false),
                onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'envoyer."),
              },
            )
          }
          onFermer={() => setCommandeOuverte(false)}
        />
      )}

      {commandeModifOuverte && commandeActive && (
        <PanneauCommande
          lignes={commandeLignesModifiables}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          enCours={basculerLigneCommandeMutation.isPending}
          pinIdsInitialementCoches={commandeActive.lignes.map((l) => l.pin_id)}
          onBasculerImmediat={(pinId, inclus) =>
            basculerLigneCommandeMutation.mutate(
              { commandeId: commandeActive.commande.id, pinId, inclus },
              {
                onError: (e) =>
                  Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer."),
              },
            )
          }
          onAnnuler={
            commandeActive.commande.statut === 'envoyee'
              ? () =>
                  annulerCommandeMutation.mutate(commandeActive.commande.id, {
                    onSuccess: () => setCommandeModifOuverte(false),
                    onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'annuler."),
                  })
              : undefined
          }
          annulationEnCours={annulerCommandeMutation.isPending}
          onFermer={() => setCommandeModifOuverte(false)}
        />
      )}

      {commandeHistoriqueOuverte && (
        <PanneauDetailCommandeHistorique
          commandeId={commandeHistoriqueOuverte}
          estAdmin={estAdmin}
          annulationEnCours={annulerCommandeMutation.isPending}
          onAnnuler={() =>
            annulerCommandeMutation.mutate(commandeHistoriqueOuverte, {
              onSuccess: () => setCommandeHistoriqueOuverte(null),
              onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'annuler."),
            })
          }
          onFermer={() => setCommandeHistoriqueOuverte(null)}
        />
      )}
    </View>
  );
}
