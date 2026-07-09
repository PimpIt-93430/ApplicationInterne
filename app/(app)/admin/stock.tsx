import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

import type { ContenuCase, MouvementComptage } from '@/api/stock';
import { CaseDetailModal } from '@/components/stock/CaseDetailModal';
import { GrilleCases } from '@/components/stock/GrilleCases';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { Dropdown } from '@/components/ui/Dropdown';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { useAuthStore } from '@/store/useAuthStore';
import { usePopUps } from '@/hooks/usePopUps';
import {
  useGererCasesPopUp,
  useGererCatalogue,
  useGrillePopUp,
  useMouvements,
  useMouvementsComptage,
  usePins,
} from '@/hooks/useStock';
import type { StockPin } from '@/types/database.types';

function PanneauPin({ pin, onFermer }: { pin: StockPin; onFermer: () => void }) {
  const profile = useAuthStore((s) => s.profile);
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
    if (!Number.isFinite(n) || n === 0 || !profile) return;
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

function CartePin({ pin, onPress }: { pin: StockPin; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: '31%' }} className="mb-3 items-center rounded-xl bg-white p-2">
      {pin.photo_url ? (
        <Image source={{ uri: pin.photo_url }} className="mb-1.5 h-16 w-16 rounded-lg bg-slate-100" />
      ) : (
        <View className="mb-1.5 h-16 w-16 items-center justify-center rounded-lg bg-slate-100">
          <Text className="text-lg text-slate-300">?</Text>
        </View>
      )}
      <Text numberOfLines={2} className="text-center text-xs text-slate-700">
        {pin.nom}
      </Text>
    </Pressable>
  );
}

interface GroupeBoiteJour {
  casePosition: string;
  mouvements: MouvementComptage[];
}

interface GroupeJour {
  jourISO: string;
  boites: GroupeBoiteJour[];
}

/** Regroupe l'historique des comptages par jour puis par boîte : trace complète de tout ce qui
 * a été compté, exploitable ensuite pour préparer le réapprovisionnement. */
function grouperRapportParJour(mouvements: MouvementComptage[]): GroupeJour[] {
  const parJour = new Map<string, Map<string, MouvementComptage[]>>();

  for (const m of mouvements) {
    if (!m.case_position) continue;
    const jourISO = m.created_at.slice(0, 10);
    const parBoite = parJour.get(jourISO) ?? new Map<string, MouvementComptage[]>();
    const liste = parBoite.get(m.case_position) ?? [];
    liste.push(m);
    parBoite.set(m.case_position, liste);
    parJour.set(jourISO, parBoite);
  }

  return [...parJour.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([jourISO, parBoite]) => ({
      jourISO,
      boites: [...parBoite.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([casePosition, mvts]) => ({ casePosition, mouvements: mvts })),
    }));
}

function LigneMouvementRapport({ mouvement }: { mouvement: MouvementComptage }) {
  return (
    <View className="mb-1 flex-row items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5">
      <Text numberOfLines={1} className="flex-1 text-sm text-slate-700">
        {mouvement.pin?.nom ?? 'Pin supprimé'}
      </Text>
      <Text className="ml-2 text-[10px] text-slate-400">{format(new Date(mouvement.created_at), 'HH:mm')}</Text>
      <Text className="ml-2 text-xs font-semibold text-slate-500">
        {mouvement.type === 'estimation'
          ? `${mouvement.pourcentage_restant}%`
          : `${Math.round(mouvement.quantite_calculee ?? 0)} restant(s)`}
      </Text>
    </View>
  );
}

function RapportStock({ rapportParJour }: { rapportParJour: GroupeJour[] }) {
  if (rapportParJour.length === 0) {
    return (
      <Text className="text-sm text-slate-400">Aucun comptage enregistré pour l'instant sur ce pop-up.</Text>
    );
  }

  return (
    <>
      {rapportParJour.map((jour) => (
        <View key={jour.jourISO} className="mb-5">
          <Text className="mb-2 text-sm font-bold capitalize text-slate-900">
            {format(parseISO(jour.jourISO), 'EEEE d MMMM yyyy', { locale: fr })}
          </Text>
          {jour.boites.map((boite) => (
            <View key={boite.casePosition} className="mb-2 rounded-xl bg-white p-3">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-slate-800">Boîte {boite.casePosition}</Text>
                <Text className="text-xs text-slate-400">
                  {boite.mouvements.length} comptage{boite.mouvements.length > 1 ? 's' : ''}
                </Text>
              </View>
              {boite.mouvements.map((mouvement) => (
                <LigneMouvementRapport key={mouvement.id} mouvement={mouvement} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

function FormulaireNouveauPin({ onFermer }: { onFermer: () => void }) {
  const { creer } = useGererCatalogue();
  const [nom, setNom] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [seuil, setSeuil] = useState('');

  const valider = () => {
    if (!nom.trim()) return;
    creer.mutate(
      { nom: nom.trim(), fournisseur: fournisseur.trim() || undefined, seuilCible: seuil ? Number(seuil) : undefined },
      { onSuccess: onFermer },
    );
  };

  return (
    <View className="mb-4 rounded-2xl border border-dashed border-indigo-300 bg-white p-4">
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
      <TextInput
        value={seuil}
        onChangeText={setSeuil}
        keyboardType="numeric"
        placeholder="Seuil cible"
        className="mb-3 rounded-lg border border-slate-200 px-3 py-2"
      />
      <View className="flex-row gap-2">
        <Pressable onPress={onFermer} className="flex-1 items-center rounded-lg border border-slate-200 py-2">
          <Text className="font-semibold text-slate-600">Annuler</Text>
        </Pressable>
        <Pressable onPress={valider} className="flex-1 items-center rounded-lg bg-indigo-600 py-2">
          <Text className="font-semibold text-white">Créer</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function StockAdminScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { data: popUps, isLoading: chargementPopUps } = usePopUps();
  const { data: pins, isLoading: chargementPins } = usePins();

  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  const popUpActif = popUpId ?? popUps?.[0]?.id;

  const { data: grille, isLoading: chargementGrille } = useGrillePopUp(popUpActif);
  const { attribuer, peser, estimer } = useGererCasesPopUp(popUpActif);
  const { data: mouvementsComptage, isLoading: chargementRapport } = useMouvementsComptage(popUpActif);

  const [vue, setVue] = useState<'boites' | 'catalogue' | 'rapport'>('boites');
  const [caseOuverte, setCaseOuverte] = useState<{ position: string; contenus: ContenuCase[] } | null>(
    null,
  );
  const [recherche, setRecherche] = useState('');
  const [pinOuvert, setPinOuvert] = useState<StockPin | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);

  const pinsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? (pins ?? []).filter((p) => p.nom.toLowerCase().includes(q)) : (pins ?? []);
  }, [pins, recherche]);

  const rapportParJour = useMemo(() => grouperRapportParJour(mouvementsComptage ?? []), [mouvementsComptage]);

  if (chargementPopUps) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Stock" />

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

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {vue === 'boites' ? (
          <>
            <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">Pop-up</Text>
            <View className="mb-4">
              <Dropdown
                value={popUpActif}
                options={(popUps ?? []).map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
                onChange={setPopUpId}
              />
            </View>

            {chargementGrille ? (
              <ActivityIndicator color="#6366F1" />
            ) : (
              <GrilleCases
                grille={grille ?? []}
                onPressCase={(position, contenus) => setCaseOuverte({ position, contenus })}
              />
            )}
          </>
        ) : (
          <>
            <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">Catalogue</Text>
            <TextInput
              value={recherche}
              onChangeText={setRecherche}
              placeholder={chargementPins ? 'Chargement…' : 'Rechercher un pin…'}
              className="mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            />
            <View className="mb-2 flex-row flex-wrap justify-between">
              {pinsAffiches.map((p) => (
                <CartePin key={p.id} pin={p} onPress={() => setPinOuvert(p)} />
              ))}
              {pinsAffiches.length === 0 && !chargementPins && (
                <Text className="mb-3 text-sm text-slate-400">Aucun résultat.</Text>
              )}
            </View>

            {formulaireOuvert ? (
              <FormulaireNouveauPin onFermer={() => setFormulaireOuvert(false)} />
            ) : (
              <Pressable onPress={() => setFormulaireOuvert(true)} className="mb-6 items-center rounded-2xl border border-dashed border-indigo-300 bg-white py-3">
                <Text className="text-sm font-semibold text-indigo-600">+ Ajouter un pin au catalogue</Text>
              </Pressable>
            )}
          </>
        )}
        {vue === 'rapport' && (
          <>
            <Text className="mb-2 text-xs font-semibold uppercase text-slate-400">
              Stock compté — {popUps?.find((p) => p.id === popUpActif)?.nom ?? ''}
            </Text>
            {chargementRapport ? (
              <ActivityIndicator color="#6366F1" />
            ) : (
              <RapportStock rapportParJour={rapportParJour} />
            )}
          </>
        )}
      </ScrollView>

      {caseOuverte && popUpActif && (
        <CaseDetailModal
          casePosition={caseOuverte.position}
          contenus={caseOuverte.contenus}
          pins={pins ?? []}
          attribuerEnCours={attribuer.isPending}
          onClose={() => setCaseOuverte(null)}
          onAttribuer={(pinIdsVoulus) => {
            if (!profile) return;
            attribuer.mutate(
              {
                casePosition: caseOuverte.position,
                pinIdsActuels: caseOuverte.contenus.map((c) => c.pin.id),
                pinIdsVoulus,
                profileId: profile.id,
              },
              { onSuccess: () => setCaseOuverte(null) },
            );
          }}
          peserEnCours={
            (peser.isPending ? peser.variables?.pinId : null) ??
            (estimer.isPending ? estimer.variables?.pinId : null) ??
            null
          }
          onPeser={(pinId, poidsPese) => {
            const contenu = caseOuverte.contenus.find((c) => c.pin.id === pinId);
            if (!contenu || !profile) return;
            peser.mutate({
              boiteId: contenu.boiteId,
              pinId,
              casePosition: caseOuverte.position,
              poidsUnitaire: contenu.pin.poids_unitaire ?? 0,
              poidsPese,
              profileId: profile.id,
            });
          }}
          onEstimer={(pinId, pourcentage) => {
            const contenu = caseOuverte.contenus.find((c) => c.pin.id === pinId);
            if (!contenu || !profile) return;
            estimer.mutate({
              boiteId: contenu.boiteId,
              pinId,
              casePosition: caseOuverte.position,
              pourcentage,
              profileId: profile.id,
            });
          }}
        />
      )}

      {pinOuvert && <PanneauPin pin={pinOuvert} onFermer={() => setPinOuvert(null)} />}
    </View>
  );
}
