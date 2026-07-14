import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { format } from 'date-fns';

import type { ContenuCase, DernierRemplissage } from '@/api/stock';
import { ModalePhotoPin } from '@/components/stock/ModalePhotoPin';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { useGererCatalogue } from '@/hooks/useStock';
import type { StockPin } from '@/types/database.types';

function LigneCommandePin({
  contenu,
  enCours,
  onBasculer,
  onOuvrirPhoto,
}: {
  contenu: ContenuCase;
  enCours: boolean;
  onBasculer: () => void;
  onOuvrirPhoto: () => void;
}) {
  return (
    <View className="mb-3 flex-row items-center gap-3 rounded-xl border border-slate-200 p-3">
      <Pressable onPress={onOuvrirPhoto} className="h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
        {contenu.pin.photo_url ? (
          <Image source={{ uri: contenu.pin.photo_url }} className="h-12 w-12 rounded-lg" />
        ) : (
          <Text className="text-xs text-slate-300">?</Text>
        )}
      </Pressable>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-slate-800">{contenu.pin.nom}</Text>
        <Text className="text-xs text-slate-400">Sac avec moins de 20 pin's ?</Text>
      </View>
      <Pressable
        onPress={onBasculer}
        disabled={enCours}
        className={`items-center justify-center rounded-lg px-4 py-2.5 ${
          contenu.aCommander ? 'bg-amber-500' : 'bg-indigo-600'
        }`}
      >
        <Text className="text-sm font-bold text-white">
          {enCours ? '…' : contenu.aCommander ? 'Annuler' : 'Commander'}
        </Text>
      </Pressable>
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
  onBasculerCommande,
  basculerCommandeEnCours,
  dernierRemplissage,
  onValiderRemplissage,
  remplissageEnCours,
}: {
  casePosition: string;
  contenus: ContenuCase[];
  pins: StockPin[];
  onClose: () => void;
  onAttribuer: (pinIdsVoulus: string[]) => void;
  attribuerEnCours: boolean;
  onBasculerCommande: (pinId: string, aCommander: boolean) => void;
  basculerCommandeEnCours?: string | null;
  dernierRemplissage: DernierRemplissage | undefined;
  onValiderRemplissage: () => void;
  remplissageEnCours: boolean;
}) {
  const [onglet, setOnglet] = useState<'commander' | 'contenu'>(
    contenus.length === 0 ? 'contenu' : 'commander',
  );
  const [pinPhotoOuvert, setPinPhotoOuvert] = useState<StockPin | null>(null);

  return (
    <FeuilleModale onClose={onClose}>
      <Text className="mb-4 text-lg font-bold text-slate-900">Case {casePosition}</Text>

      <View className="mb-4 flex-row gap-2">
        <Pressable
          onPress={() => setOnglet('commander')}
          className={`flex-1 items-center rounded-lg py-2 ${
            onglet === 'commander' ? 'bg-indigo-600' : 'bg-slate-100'
          }`}
        >
          <Text className={onglet === 'commander' ? 'font-semibold text-white' : 'text-slate-600'}>
            Commander
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

      {onglet === 'commander' ? (
        contenus.length === 0 ? (
          <Text className="mb-4 text-center text-sm text-slate-400">
            Cette case est vide — passe dans l'onglet "Contenu" pour y ajouter des pins.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            {contenus.map((contenu) => (
              <LigneCommandePin
                key={contenu.boiteId}
                contenu={contenu}
                enCours={basculerCommandeEnCours === contenu.boiteId}
                onBasculer={() => onBasculerCommande(contenu.pin.id, !contenu.aCommander)}
                onOuvrirPhoto={() => setPinPhotoOuvert(contenu.pin)}
              />
            ))}
          </ScrollView>
        )
      ) : (
        <OngletContenu contenus={contenus} pins={pins} enCours={attribuerEnCours} onValider={onAttribuer} />
      )}

      {onglet === 'commander' && (
        <>
          <Pressable
            onPress={onValiderRemplissage}
            disabled={remplissageEnCours}
            className="mt-3 items-center rounded-xl bg-emerald-500 py-3.5"
          >
            <Text className="text-base font-bold text-white">
              {remplissageEnCours ? 'Enregistrement…' : '✓ Valider le remplissage'}
            </Text>
          </Pressable>
          <Text className="mt-2 text-center text-xs text-slate-400">
            {dernierRemplissage
              ? `Dernier remplissage : ${dernierRemplissage.profileNom} le ${format(new Date(dernierRemplissage.createdAt), 'dd/MM à HH:mm')}`
              : 'Jamais validé'}
          </Text>
        </>
      )}

      <Pressable onPress={onClose} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>

      {pinPhotoOuvert && <ModalePhotoPin pin={pinPhotoOuvert} onFermer={() => setPinPhotoOuvert(null)} />}
    </FeuilleModale>
  );
}
