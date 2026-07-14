import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
  useMouvements,
  useRemplissages,
  usePins,
} from '@/hooks/useStock';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import type { Profile, StockPin, TaillePin } from '@/types/database.types';

function PanneauPin({ pin, profile, onFermer }: { pin: StockPin; profile: Profile; onFermer: () => void }) {
  const { modifier, ajusterStock } = useGererCatalogue();
  const { data: mouvements } = useMouvements({ pinId: pin.id });

  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');

  const enregistrerSeuil = () => {
    const valeur = seuil.trim() === '' ? null : Number(seuil);
    modifier.mutate({ id: pin.id, params: { seuil_cible: valeur } });
  };

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
        <Text className="mb-1 text-lg font-bold text-slate-900">{pin.nom}</Text>
        <Text className="mb-4 text-sm text-slate-400">{pin.fournisseur ?? 'Fournisseur inconnu'}</Text>

        <View className="mb-4 flex-row justify-between rounded-xl bg-slate-50 p-3">
          <Text className="text-sm text-slate-500">Stock général</Text>
          <Text className="text-base font-bold text-slate-900">{pin.stock_general}</Text>
        </View>

        <Text className="mb-1 text-xs font-semibold uppercase text-slate-400">Seuil cible</Text>
        <View className="mb-4 flex-row gap-2">
          <TextInput
            value={seuil}
            onChangeText={setSeuil}
            keyboardType="numeric"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5"
          />
          <Pressable onPress={enregistrerSeuil} className="items-center justify-center rounded-xl bg-slate-100 px-4">
            <Text className="font-semibold text-slate-600">Enregistrer</Text>
          </Pressable>
        </View>

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

const TAILLES: { valeur: TaillePin; label: string }[] = [
  { valeur: 'petit', label: 'P' },
  { valeur: 'moyen', label: 'M' },
  { valeur: 'gros', label: 'G' },
];

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
  const { modifier } = useGererCatalogue();
  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));
  const [poids, setPoids] = useState(pin.poids_unitaire !== null ? String(pin.poids_unitaire) : '');

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

  return (
    <View className="mb-2.5 rounded-xl bg-white p-3">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onOuvrirPhoto}
          className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100"
        >
          <Text className="text-xs text-slate-400">{pin.photo_url ? '📷' : '?'}</Text>
        </Pressable>
        <Pressable onPress={onOuvrirDetail} className="flex-1">
          <Text numberOfLines={2} className="text-sm font-semibold text-slate-800">
            {pin.nom}
          </Text>
        </Pressable>
      </View>

      <View className="ml-12 mt-1.5">
        <BadgeAttribution attributions={attributions} />
      </View>

      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        <Text className="mr-1 text-xs text-slate-400">Taille</Text>
        {TAILLES.map((t) => (
          <Pressable
            key={t.valeur}
            onPress={() => modifier.mutate({ id: pin.id, params: { taille: t.valeur } })}
            hitSlop={6}
            className={`h-12 w-12 items-center justify-center rounded-xl ${
              pin.taille === t.valeur ? 'bg-indigo-600' : 'bg-slate-100'
            }`}
          >
            <Text
              className={`text-lg font-bold ${pin.taille === t.valeur ? 'text-white' : 'text-slate-500'}`}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}

        <View className="ml-auto flex-row items-center gap-2">
          <Text className="text-xs text-slate-400">Seuil</Text>
          <TextInput
            value={seuil}
            onChangeText={setSeuil}
            onEndEditing={enregistrerSeuil}
            keyboardType="numeric"
            placeholder="—"
            className="h-12 w-24 rounded-xl border border-slate-200 px-3 text-base"
          />
        </View>
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <Text className="text-xs text-slate-400">Poids (g/10)</Text>
        <TextInput
          value={poids}
          onChangeText={setPoids}
          onEndEditing={enregistrerPoids}
          keyboardType="decimal-pad"
          placeholder="—"
          className={`h-12 w-24 rounded-xl border px-3 text-base ${
            pin.poids_unitaire === null ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200'
          }`}
        />
        {pin.poids_unitaire === null && (
          <Text className="flex-1 text-[11px] text-amber-600">
            Manquant — nécessaire pour peser ce pin.
          </Text>
        )}
      </View>
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
        ) : (
          <Pressable
            onPress={() => onToggleFormulaire(true)}
            className="mb-6 items-center rounded-2xl border border-dashed border-indigo-300 bg-white py-3"
          >
            <Text className="text-sm font-semibold text-indigo-600">+ Ajouter un pin au catalogue</Text>
          </Pressable>
        )
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

function GaleriePhotosCommande({ lignes, onFermer }: { lignes: LigneCommande[]; onFermer: () => void }) {
  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-4 text-lg font-bold text-slate-900">Photos à commander</Text>
      <ScrollView>
        <View className="flex-row flex-wrap justify-between">
          {lignes.map((ligne) => (
            <View key={ligne.pin.id} style={{ width: '31%' }} className="mb-4 items-center">
              {ligne.pin.photo_url ? (
                <Image source={{ uri: ligne.pin.photo_url }} className="mb-1.5 h-20 w-20 rounded-lg bg-slate-100" />
              ) : (
                <View className="mb-1.5 h-20 w-20 items-center justify-center rounded-lg bg-slate-100">
                  <Text className="text-lg text-slate-300">?</Text>
                </View>
              )}
              <Text numberOfLines={2} className="text-center text-xs text-slate-700">
                {ligne.pin.nom}
              </Text>
            </View>
          ))}
        </View>
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
  onOuvrirPhoto,
}: {
  lignes: LigneCommande[];
  popUpNom: string;
  enCours: boolean;
  onValider: () => void;
  onFermer: () => void;
  onOuvrirPhoto: (pin: StockPin) => void;
}) {
  const [galerieOuverte, setGalerieOuverte] = useState(false);

  const confirmerValidation = () => {
    Alert.alert(
      'Valider la commande reçue',
      `Une fois les pins ramenés, ça retire "à commander" de toutes les boîtes de ${popUpNom}. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Valider', style: 'destructive', onPress: onValider },
      ],
    );
  };

  return (
    <>
      <FeuilleModale onClose={onFermer}>
        <Text className="mb-1 text-lg font-bold text-slate-900">Commande — {popUpNom}</Text>
        <Text className="mb-3 text-sm text-slate-400">
          Pins signalés "à commander" sur les boîtes de ce pop-up.
        </Text>

        {lignes.length > 0 && (
          <Pressable
            onPress={() => setGalerieOuverte(true)}
            className="mb-4 items-center rounded-xl border border-indigo-200 bg-indigo-50 py-2.5"
          >
            <Text className="text-sm font-semibold text-indigo-600">📷 Voir toutes les photos</Text>
          </Pressable>
        )}

        <ScrollView style={{ maxHeight: 420 }}>
          {lignes.length === 0 ? (
            <Text className="text-sm text-slate-400">Rien à commander pour l'instant.</Text>
          ) : (
            lignes.map((ligne) => (
              <View key={ligne.pin.id} className="mb-1.5 flex-row items-center gap-3 rounded-lg bg-amber-50 px-3 py-2">
                <Pressable
                  onPress={() => onOuvrirPhoto(ligne.pin)}
                  className="h-9 w-9 items-center justify-center rounded-lg bg-white"
                >
                  <Text className="text-xs text-slate-400">{ligne.pin.photo_url ? '📷' : '?'}</Text>
                </Pressable>
                <Text numberOfLines={1} className="flex-1 text-sm text-slate-700">
                  {ligne.pin.nom}
                </Text>
                <Text className="ml-2 text-sm font-bold text-amber-700">
                  Seuil : {ligne.pin.seuil_cible ?? '—'}
                </Text>
              </View>
            ))
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

      {galerieOuverte && (
        <GaleriePhotosCommande lignes={lignes} onFermer={() => setGalerieOuverte(false)} />
      )}
    </>
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

/** Écran Stock complet (Boîtes / Catalogue / Rapport) — identique pour tout le monde. Seule
 * différence, imposée par les droits en base (RLS, écriture sur stock_pins réservée aux admins) :
 * créer un pin, modifier son seuil cible ou ajuster le stock général sont réservés aux admins,
 * et la roulette pop-up ne propose que les lieux attribués pour un non-admin (tous pour un admin,
 * cf. estAttribueA/popUpsAttribues déjà utilisés partout ailleurs dans l'app). Compter les
 * boîtes (peser/estimer/effacer/attribuer des pins) reste identique pour tous, sur leurs lieux.
 */
export function StockScreen({ profile, onRetour }: { profile: Profile; onRetour: () => void }) {
  const estAdmin = profile.role === 'admin';
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const { data: pins, isLoading: chargementPins } = usePins();
  const { data: attributions } = useAttributionsPins();

  const popUps = estAdmin
    ? (popUpsTous ?? [])
    : popUpsAttribues(profile, construireMapAffectations(affectations ?? []), popUpsTous ?? []);

  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  const popUpActif = popUpId ?? popUps[0]?.id;

  const { data: grille, isLoading: chargementGrille } = useGrillePopUp(popUpActif);
  const { attribuer, basculerCommande, validerRemplissage, validerCommandes, supprimerRemplissage } =
    useGererCasesPopUp(popUpActif);
  const { data: derniersRemplissages } = useDerniersRemplissages(popUpActif);
  const { data: remplissages, isLoading: chargementRapport } = useRemplissages(popUpActif);

  const [vue, setVue] = useState<'boites' | 'catalogue' | 'rapport'>('boites');
  // Seule la position est mémorisée — le contenu est relu à chaque rendu depuis `grille` (source
  // de vérité toujours à jour), pour que le poids saisi apparaisse immédiatement dans la case
  // encore ouverte, sans avoir à la fermer et la rouvrir pour rafraîchir l'affichage.
  const [casePositionOuverte, setCasePositionOuverte] = useState<string | null>(null);
  const contenusOuverts = grille?.find((c) => c.casePosition === casePositionOuverte)?.contenus ?? [];
  const [recherche, setRecherche] = useState('');
  const [caseFiltre, setCaseFiltre] = useState<string | null>(null);
  const [pinOuvert, setPinOuvert] = useState<StockPin | null>(null);
  const [pinPhotoOuvert, setPinPhotoOuvert] = useState<StockPin | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [commandeOuverte, setCommandeOuverte] = useState(false);

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

  const pinsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    let liste = pins ?? [];
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
  }, [pins, recherche, caseFiltre, attributionsParPin]);

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
          className={`flex-1 items-center rounded-lg py-2.5 ${vue === 'catalogue' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={vue === 'catalogue' ? 'font-semibold text-white' : 'text-slate-600'}>
            Catalogue
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setVue('rapport')}
          className={`flex-1 items-center rounded-lg py-2.5 ${vue === 'rapport' ? 'bg-indigo-600' : 'bg-slate-100'}`}
        >
          <Text className={vue === 'rapport' ? 'font-semibold text-white' : 'text-slate-600'}>
            Rapport
          </Text>
        </Pressable>
      </View>

      {vue === 'catalogue' ? (
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
                  <Pressable onPress={() => setCommandeOuverte(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5">
                    <Text className="text-xs font-semibold text-white">Voir la commande</Text>
                  </Pressable>
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

      {pinPhotoOuvert && <ModalePhotoPin pin={pinPhotoOuvert} onFermer={() => setPinPhotoOuvert(null)} />}

      {commandeOuverte && popUpActif && (
        <PanneauCommande
          lignes={commandeLignes}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          enCours={validerCommandes.isPending}
          onOuvrirPhoto={setPinPhotoOuvert}
          onValider={() =>
            validerCommandes.mutate(undefined, {
              onSuccess: () => setCommandeOuverte(false),
              onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de valider.'),
            })
          }
          onFermer={() => setCommandeOuverte(false)}
        />
      )}
    </View>
  );
}
