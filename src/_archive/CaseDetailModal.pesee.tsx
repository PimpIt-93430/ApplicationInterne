import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { estContenuCompte, statutCase, type ContenuCase } from '@/api/stock';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { GlisseurPourcentage } from '@/components/ui/GlisseurPourcentage';
import { useGererCatalogue } from '@/hooks/useStock';
import type { StockPin } from '@/types/database.types';

function DerniereMesure({ contenu }: { contenu: ContenuCase }) {
  let texte = 'Jamais compté';
  if (contenu.pourcentageRestant !== null) {
    texte = `Dernière estimation : ${contenu.pourcentageRestant}% restant`;
  } else if (contenu.quantiteRestante !== null) {
    texte = `Dernière pesée : ${contenu.quantiteRestante} restant(s) (${contenu.poidsPese} g)`;
  }
  return <Text className="text-xs text-slate-400">{texte}</Text>;
}

function LignePesee({
  contenu,
  enCours,
  onPeser,
  onEstimer,
  onSupprimer,
  onDevenirActif,
}: {
  contenu: ContenuCase;
  enCours: boolean;
  onPeser: (poidsPese: number) => void;
  onEstimer: (pourcentage: number) => void;
  onSupprimer: () => void;
  onDevenirActif: (valider: () => void) => void;
}) {
  const [mode, setMode] = useState<'poids' | 'pourcentage'>('poids');
  const [poids, setPoids] = useState(() => (contenu.poidsPese !== null ? String(contenu.poidsPese) : ''));
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
    // Le champ reste rempli avec le poids pesé (au lieu de se vider) : on veut le voir tant
    // qu'on n'a pas fini de compter toute la boîte, pas juste une petite ligne "Dernière pesée".
  };

  // Une fois le poids confirmé par le serveur (contenu.poidsPese à jour après la mutation), ou à
  // la réouverture d'une case déjà pesée, le champ reprend cette valeur — sauf pendant que la
  // personne est justement en train de la modifier (focus), pour ne pas lui couper la saisie.
  useEffect(() => {
    if (focus) return;
    setPoids(contenu.poidsPese !== null ? String(contenu.poidsPese) : '');
  }, [contenu.poidsPese, focus]);

  // Tant que ce champ a le focus, le bouton "OK" du clavier (partagé entre toutes les lignes)
  // doit enregistrer CETTE pesée : on republie le dernier `valider` à chaque frappe.
  useEffect(() => {
    if (focus) onDevenirActif(valider);
  });

  return (
    <View className="mb-3 rounded-xl border border-slate-200 p-3">
      <View className="mb-2 flex-row items-center gap-3">
        {contenu.pin.photo_url ? (
          <Image source={{ uri: contenu.pin.photo_url }} className="h-12 w-12 rounded-lg bg-slate-100" />
        ) : (
          <View className="h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
            <Text className="text-xs text-slate-300">?</Text>
          </View>
        )}
        <View className="flex-1">
          <Text className="text-sm font-semibold text-slate-800">{contenu.pin.nom}</Text>
          <DerniereMesure contenu={contenu} />
        </View>
        {estContenuCompte(contenu) && !enCours && (
          <Pressable
            onPress={() =>
              Alert.alert('Effacer le comptage', `Remettre "${contenu.pin.nom}" à "Jamais compté" ?`, [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Effacer', style: 'destructive', onPress: onSupprimer },
              ])
            }
            hitSlop={8}
            className="px-1 py-1"
          >
            <Text className="text-xs font-semibold text-red-500">Effacer</Text>
          </Pressable>
        )}
      </View>

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

function AjoutRapidePin({ onCree }: { onCree: (pin: StockPin) => void }) {
  const { creer } = useGererCatalogue();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState('');

  const valider = () => {
    if (!nom.trim()) return;
    creer.mutate(
      { nom: nom.trim() },
      {
        onSuccess: (nouveauPin) => {
          onCree(nouveauPin);
          setNom('');
          setOuvert(false);
        },
      },
    );
  };

  if (!ouvert) {
    return (
      <Pressable onPress={() => setOuvert(true)} className="mb-3 items-center py-1.5">
        <Text className="text-xs font-semibold text-indigo-600">+ Ajouter un pin à la main</Text>
      </Pressable>
    );
  }

  return (
    <View className="mb-3 flex-row gap-2">
      <TextInput
        value={nom}
        onChangeText={setNom}
        onSubmitEditing={valider}
        placeholder="Nom du pin"
        autoFocus
        className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5"
      />
      <Pressable
        onPress={valider}
        disabled={creer.isPending}
        className="items-center justify-center rounded-xl bg-indigo-600 px-4"
      >
        <Text className="font-semibold text-white">{creer.isPending ? '…' : 'Ajouter'}</Text>
      </Pressable>
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
  // Pins créés à la volée pendant que cette case est ouverte : affichés immédiatement sans
  // attendre le refetch du catalogue côté parent (qui finira de toute façon par les inclure).
  const [pinsRapides, setPinsRapides] = useState<StockPin[]>([]);

  const pinsTous = useMemo(() => {
    const vus = new Set(pins.map((p) => p.id));
    return [...pins, ...pinsRapides.filter((p) => !vus.has(p.id))];
  }, [pins, pinsRapides]);

  const pinsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? pinsTous.filter((p) => p.nom.toLowerCase().includes(q)) : pinsTous;
  }, [pinsTous, recherche]);

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

      <AjoutRapidePin
        onCree={(pin) => {
          setPinsRapides((precedents) => [...precedents, pin]);
          setSelection((precedente) => new Set(precedente).add(pin.id));
        }}
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
  onSupprimerComptage,
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
  onSupprimerComptage: (pinId: string) => void;
  peserEnCours?: string | null;
}) {
  const [onglet, setOnglet] = useState<'compter' | 'contenu'>(
    contenus.length === 0 ? 'contenu' : 'compter',
  );
  const [hauteurClavier, setHauteurClavier] = useState(0);
  const validerActifRef = useRef<(() => void) | null>(null);
  const boiteComplete = contenus.length > 0 && statutCase(contenus) === 'complet';

  // Enregistre la pesée en cours de saisie (celle du champ actuellement focus) puis "consomme"
  // le validateur pour ne pas le redéclencher deux fois (OK + fermeture native du clavier).
  const enregistrerSaisieEnCours = () => {
    validerActifRef.current?.();
    validerActifRef.current = null;
  };

  useEffect(() => {
    const evtAffiche = Keyboard.addListener('keyboardDidShow', (e) => setHauteurClavier(e.endCoordinates.height));
    // Sur Android, le clavier peut se fermer tout seul (tap en dehors du champ) avant que le
    // onPress du bouton OK n'ait le temps de se déclencher : on enregistre donc ici, sur
    // l'événement natif de fermeture, plutôt que de compter uniquement sur le tap du bouton.
    const evtCache = Keyboard.addListener('keyboardDidHide', () => {
      enregistrerSaisieEnCours();
      setHauteurClavier(0);
    });
    return () => {
      evtAffiche.remove();
      evtCache.remove();
    };
  }, []);

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
                onSupprimer={() => onSupprimerComptage(contenu.pin.id)}
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

      {onglet === 'compter' && contenus.length > 0 ? (
        <Pressable
          onPress={() => {
            if (boiteComplete) {
              onClose();
              return;
            }
            Alert.alert(
              'Boîte incomplète',
              "Vous n'avez pas pesé tous les pins de cette boîte. Voulez-vous valider quand même ou continuer le comptage ?",
              [
                { text: 'Continuer le comptage', style: 'cancel' },
                { text: 'Valider quand même', onPress: onClose },
              ],
            );
          }}
          className={`mt-3 items-center rounded-xl py-3.5 ${boiteComplete ? 'bg-emerald-500' : 'bg-slate-200'}`}
        >
          <Text className={`text-base font-bold ${boiteComplete ? 'text-white' : 'text-slate-500'}`}>
            ✓ Valider la boîte
          </Text>
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
              enregistrerSaisieEnCours();
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
