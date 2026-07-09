import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { statutCase, type ContenuCase } from '@/api/stock';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { GlisseurPourcentage } from '@/components/ui/GlisseurPourcentage';
import { useGererCatalogue } from '@/hooks/useStock';
import type { StockPin } from '@/types/database.types';

/** Hauteur du clavier visible (0 si masqué). InputAccessoryView est iOS-only, donc on
 * reconstruit une barre "OK" au-dessus du clavier qui marche aussi sur Android. */
function useHauteurClavier() {
  const [hauteur, setHauteur] = useState(0);

  useEffect(() => {
    const evtAffiche = Keyboard.addListener('keyboardDidShow', (e) => setHauteur(e.endCoordinates.height));
    const evtCache = Keyboard.addListener('keyboardDidHide', () => setHauteur(0));
    return () => {
      evtAffiche.remove();
      evtCache.remove();
    };
  }, []);

  return hauteur;
}

function DerniereMesure({ contenu }: { contenu: ContenuCase }) {
  let texte = 'Jamais compté';
  if (contenu.pourcentageRestant !== null) {
    texte = `Dernière estimation : ${contenu.pourcentageRestant}% restant`;
  } else if (contenu.quantiteRestante !== null) {
    texte = `Dernière pesée : ${contenu.quantiteRestante} restant(s) (${contenu.poidsPese} g)`;
  }
  return <Text className="mb-2 text-xs text-slate-400">{texte}</Text>;
}

function LignePesee({
  contenu,
  enCours,
  onPeser,
  onEstimer,
  onDevenirActif,
}: {
  contenu: ContenuCase;
  enCours: boolean;
  onPeser: (poidsPese: number) => void;
  onEstimer: (pourcentage: number) => void;
  onDevenirActif: (valider: () => void) => void;
}) {
  const [mode, setMode] = useState<'poids' | 'pourcentage'>('poids');
  const [poids, setPoids] = useState('');
  const [focus, setFocus] = useState(false);
  const poidsUnitaire = contenu.pin.poids_unitaire;
  const poidsSaisi = Number(poids.replace(',', '.'));
  // poidsUnitaire = poids catalogue d'un lot de 10 pins (pesé ainsi pour plus de précision).
  const quantiteCalculee =
    poidsUnitaire && poidsUnitaire > 0 && poids.trim() !== '' && Number.isFinite(poidsSaisi)
      ? Math.round((poidsSaisi / poidsUnitaire) * 10)
      : null;

  const valider = () => {
    if (quantiteCalculee === null || !Number.isFinite(poidsSaisi) || enCours) return;
    onPeser(poidsSaisi);
  };

  // Tant que ce champ a le focus, le bouton "OK" du clavier (partagé entre toutes les lignes)
  // doit enregistrer CETTE pesée : on republie le dernier `valider` à chaque frappe.
  useEffect(() => {
    if (focus) onDevenirActif(valider);
  });

  return (
    <View className="mb-3 rounded-xl border border-slate-200 p-3">
      <Text className="mb-0.5 text-sm font-semibold text-slate-800">{contenu.pin.nom}</Text>
      <DerniereMesure contenu={contenu} />

      {mode === 'pourcentage' ? (
        <>
          <GlisseurPourcentage valeur={contenu.pourcentageRestant ?? 0} onChange={onEstimer} />
          <Pressable onPress={() => setMode('poids')} className="mt-2 items-center py-1">
            <Text className="text-xs font-semibold text-indigo-600">J'ai un sac à peser</Text>
          </Pressable>
        </>
      ) : !poidsUnitaire || poidsUnitaire <= 0 ? (
        <Text className="text-xs text-red-500">
          Poids unitaire manquant — à renseigner dans le catalogue pour pouvoir peser ce pin.
        </Text>
      ) : (
        <>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={poids}
              onChangeText={setPoids}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              onSubmitEditing={valider}
              keyboardType="decimal-pad"
              placeholder="Poids pesé (g)"
              editable={!enCours}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2"
            />
            <Text className="w-28 text-center text-xs font-semibold text-slate-500">
              {enCours
                ? 'Enregistrement…'
                : quantiteCalculee !== null
                  ? `≈ ${quantiteCalculee} restant(s)`
                  : '—'}
            </Text>
          </View>
          <Pressable onPress={() => setMode('pourcentage')} className="mt-2 items-center py-1">
            <Text className="text-xs font-semibold text-slate-400">Plus de sac ? Estimer un %</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function LignePinAttribution({
  pin,
  coche,
  onPress,
}: {
  pin: StockPin;
  coche: boolean;
  onPress: () => void;
}) {
  const { modifier } = useGererCatalogue();
  const [seuil, setSeuil] = useState(String(pin.seuil_cible ?? ''));

  const enregistrerSeuil = () => {
    const valeur = seuil.trim() === '' ? null : Number(seuil);
    if (valeur === pin.seuil_cible) return;
    modifier.mutate({ id: pin.id, params: { seuil_cible: valeur } });
  };

  return (
    <View className="mb-1.5 rounded-lg px-2 py-2">
      <Pressable onPress={onPress} className="flex-row items-center gap-3">
        {pin.photo_url ? (
          <Image source={{ uri: pin.photo_url }} className="h-10 w-10 rounded-md bg-slate-100" />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-md bg-slate-100">
            <Text className="text-xs text-slate-300">?</Text>
          </View>
        )}
        <Text numberOfLines={2} className="flex-1 text-sm text-slate-800">
          {pin.nom}
        </Text>
        <View
          className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
            coche ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200'
          }`}
        >
          {coche && <Text className="text-xs font-bold text-white">✓</Text>}
        </View>
      </Pressable>

      {coche && (
        <View className="ml-[52px] mt-1.5 flex-row items-center gap-2">
          <Text className="text-xs text-slate-400">Seuil cible</Text>
          <TextInput
            value={seuil}
            onChangeText={setSeuil}
            onEndEditing={enregistrerSeuil}
            keyboardType="numeric"
            placeholder="—"
            className="w-16 rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </View>
      )}
    </View>
  );
}

function OngletContenu({
  contenus,
  pins,
  enCours,
  onValider,
}: {
  contenus: ContenuCase[];
  pins: StockPin[];
  enCours: boolean;
  onValider: (pinIdsVoulus: string[]) => void;
}) {
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<Set<string>>(
    () => new Set(contenus.map((c) => c.pin.id)),
  );

  const pinsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? pins.filter((p) => p.nom.toLowerCase().includes(q)) : pins;
  }, [pins, recherche]);

  const basculer = (pinId: string) => {
    setSelection((precedente) => {
      const suivante = new Set(precedente);
      if (suivante.has(pinId)) suivante.delete(pinId);
      else suivante.add(pinId);
      return suivante;
    });
  };

  return (
    <>
      <Text className="mb-3 text-sm text-slate-400">
        {selection.size} pin{selection.size > 1 ? 's' : ''} sélectionné{selection.size > 1 ? 's' : ''}
      </Text>

      <TextInput
        value={recherche}
        onChangeText={setRecherche}
        placeholder="Rechercher un pin…"
        className="mb-3 rounded-xl border border-slate-200 px-4 py-3"
      />

      <FlatList
        data={pinsFiltres}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: 320 }}
        renderItem={({ item }) => (
          <LignePinAttribution pin={item} coche={selection.has(item.id)} onPress={() => basculer(item.id)} />
        )}
        ListEmptyComponent={
          <Text className="p-3 text-center text-sm text-slate-400">Aucun pin trouvé.</Text>
        }
      />

      <Pressable
        onPress={() => onValider([...selection])}
        disabled={enCours}
        className="mt-4 items-center rounded-xl bg-indigo-600 py-3"
      >
        <Text className="font-semibold text-white">{enCours ? 'Enregistrement…' : 'Valider les pins de la case'}</Text>
      </Pressable>
    </>
  );
}

export function CaseDetailModal({
  casePosition,
  contenus,
  pins,
  onClose,
  onAttribuer,
  attribuerEnCours,
  onPeser,
  onEstimer,
  peserEnCours,
}: {
  casePosition: string;
  contenus: ContenuCase[];
  pins: StockPin[];
  onClose: () => void;
  onAttribuer: (pinIdsVoulus: string[]) => void;
  attribuerEnCours: boolean;
  onPeser: (pinId: string, poidsPese: number) => void;
  onEstimer: (pinId: string, pourcentage: number) => void;
  peserEnCours?: string | null;
}) {
  const [onglet, setOnglet] = useState<'compter' | 'contenu'>(
    contenus.length === 0 ? 'contenu' : 'compter',
  );
  const hauteurClavier = useHauteurClavier();
  const validerActifRef = useRef<(() => void) | null>(null);
  const boiteComplete = contenus.length > 0 && statutCase(contenus) === 'complet';

  return (
    <FeuilleModale onClose={onClose}>
      <Text className="mb-4 text-lg font-bold text-slate-900">Case {casePosition}</Text>

      <View className="mb-4 flex-row gap-2">
        <Pressable
          onPress={() => setOnglet('compter')}
          className={`flex-1 items-center rounded-lg py-2 ${
            onglet === 'compter' ? 'bg-indigo-600' : 'bg-slate-100'
          }`}
        >
          <Text className={onglet === 'compter' ? 'font-semibold text-white' : 'text-slate-600'}>
            Compter
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setOnglet('contenu')}
          className={`flex-1 items-center rounded-lg py-2 ${
            onglet === 'contenu' ? 'bg-indigo-600' : 'bg-slate-100'
          }`}
        >
          <Text className={onglet === 'contenu' ? 'font-semibold text-white' : 'text-slate-600'}>
            Contenu ({contenus.length})
          </Text>
        </Pressable>
      </View>

      {onglet === 'compter' ? (
        contenus.length === 0 ? (
          <Text className="mb-4 text-center text-sm text-slate-400">
            Cette case est vide — passe dans l'onglet "Contenu" pour y ajouter des pins.
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
            {contenus.map((contenu) => (
              <LignePesee
                key={contenu.boiteId}
                contenu={contenu}
                enCours={peserEnCours === contenu.pin.id}
                onPeser={(poidsPese) => onPeser(contenu.pin.id, poidsPese)}
                onEstimer={(pourcentage) => onEstimer(contenu.pin.id, pourcentage)}
                onDevenirActif={(valider) => {
                  validerActifRef.current = valider;
                }}
              />
            ))}
          </ScrollView>
        )
      ) : (
        <OngletContenu contenus={contenus} pins={pins} enCours={attribuerEnCours} onValider={onAttribuer} />
      )}

      {onglet === 'compter' && boiteComplete ? (
        <Pressable onPress={onClose} className="mt-3 items-center rounded-xl bg-emerald-500 py-3.5">
          <Text className="text-base font-bold text-white">✓ Valider la boîte</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onClose} className="mt-3 items-center py-2">
          <Text className="font-semibold text-indigo-600">Fermer</Text>
        </Pressable>
      )}

      {hauteurClavier > 0 && (
        <View
          style={{ position: 'absolute', left: 0, right: 0, bottom: hauteurClavier }}
          className="flex-row justify-end border-t border-slate-200 bg-slate-50 px-4 py-2.5"
        >
          <Pressable
            onPress={() => {
              validerActifRef.current?.();
              Keyboard.dismiss();
            }}
            className="items-center justify-center rounded-lg bg-indigo-600 px-8 py-3"
          >
            <Text className="text-lg font-bold text-white">OK</Text>
          </Pressable>
        </View>
      )}
    </FeuilleModale>
  );
}
