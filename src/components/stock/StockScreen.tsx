import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

import { calculerReapprovisionnement, type LigneReapprovisionnement, type MouvementComptage } from '@/api/stock';
import { CaseDetailModal } from '@/components/stock/CaseDetailModal';
import { GrilleCases } from '@/components/stock/GrilleCases';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { Dropdown } from '@/components/ui/Dropdown';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import {
  useGererCasesPopUp,
  useGererCatalogue,
  useGrillePopUp,
  useMouvements,
  useMouvementsComptage,
  usePins,
} from '@/hooks/useStock';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import type { Profile, StockPin } from '@/types/database.types';

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

function LigneBoiteRapport({
  boite,
  onPress,
  onSupprimer,
}: {
  boite: GroupeBoiteJour;
  onPress: () => void;
  onSupprimer: () => void;
}) {
  const derniere = boite.mouvements.reduce(
    (max, m) => (m.created_at > max ? m.created_at : max),
    boite.mouvements[0].created_at,
  );

  return (
    <View className="mb-2 flex-row items-center rounded-xl bg-white p-3">
      <Pressable onPress={onPress} className="flex-1 flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-bold text-slate-800">Boîte {boite.casePosition}</Text>
          <Text className="text-xs text-slate-400">
            {boite.mouvements.length} pin{boite.mouvements.length > 1 ? 's' : ''} compté
            {boite.mouvements.length > 1 ? 's' : ''} · {format(new Date(derniere), 'HH:mm')}
          </Text>
        </View>
        <Text className="text-lg text-indigo-400">›</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          Alert.alert(
            'Supprimer ce comptage',
            `Supprimer le comptage de la boîte ${boite.casePosition} de ce jour-là ? Cette action est irréversible.`,
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Supprimer', style: 'destructive', onPress: onSupprimer },
            ],
          )
        }
        hitSlop={8}
        className="ml-3 px-1 py-1"
      >
        <Text className="text-xs font-semibold text-red-500">Supprimer</Text>
      </Pressable>
    </View>
  );
}

function RapportStock({
  rapportParJour,
  onPressBoite,
  onSupprimerBoite,
}: {
  rapportParJour: GroupeJour[];
  onPressBoite: (casePosition: string) => void;
  onSupprimerBoite: (casePosition: string, jourISO: string) => void;
}) {
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
            <LigneBoiteRapport
              key={boite.casePosition}
              boite={boite}
              onPress={() => onPressBoite(boite.casePosition)}
              onSupprimer={() => onSupprimerBoite(boite.casePosition, jour.jourISO)}
            />
          ))}
        </View>
      ))}
    </>
  );
}

function PanneauReapprovisionnement({
  lignes,
  popUpNom,
  enCours,
  onValider,
  onFermer,
}: {
  lignes: LigneReapprovisionnement[];
  popUpNom: string;
  enCours: boolean;
  onValider: () => void;
  onFermer: () => void;
}) {
  const confirmerValidation = () => {
    Alert.alert(
      'Valider le réapprovisionnement',
      `Une fois ramené, ça efface tout le comptage des boîtes de ${popUpNom} pour repartir de zéro. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Valider', style: 'destructive', onPress: onValider },
      ],
    );
  };

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-1 text-lg font-bold text-slate-900">Réapprovisionnement — {popUpNom}</Text>
      <Text className="mb-4 text-sm text-slate-400">À ramener du local, d'après les cases déjà comptées.</Text>

      <ScrollView style={{ maxHeight: 420 }}>
        {lignes.length === 0 ? (
          <Text className="text-sm text-slate-400">Rien à ramener pour l'instant — tout est au seuil cible.</Text>
        ) : (
          lignes.map((ligne) => (
            <View key={ligne.pin.id} className="mb-1.5 flex-row items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
              <Text numberOfLines={1} className="flex-1 text-sm text-slate-700">
                {ligne.pin.nom}
              </Text>
              <Text className="ml-2 text-sm font-bold text-amber-700">{ligne.quantite}</Text>
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
          {enCours ? 'Validation…' : 'Valider le réapprovisionnement'}
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

/** Écran Stock complet (Boîtes / Catalogue / Rapport) — identique pour tout le monde. Seule
 * différence, imposée par les droits en base (RLS, écriture sur stock_pins réservée aux admins) :
 * créer un pin, modifier son seuil cible ou ajuster le stock général sont réservés aux admins,
 * et la roulette pop-up ne propose que les lieux attribués pour un non-admin (tous pour un admin,
 * cf. estAttribueA/popUpsAttribues déjà utilisés partout ailleurs dans l'app). Compter les
 * boîtes (peser/estimer/effacer/attribuer des pins) reste identique pour tous, sur leurs lieux.
 */
export function StockScreen({ profile }: { profile: Profile }) {
  const estAdmin = profile.role === 'admin';
  const { data: popUpsTous, isLoading: chargementPopUps } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const { data: pins, isLoading: chargementPins } = usePins();

  const popUps = estAdmin
    ? (popUpsTous ?? [])
    : popUpsAttribues(profile, construireMapAffectations(affectations ?? []), popUpsTous ?? []);

  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  const popUpActif = popUpId ?? popUps[0]?.id;

  const { data: grille, isLoading: chargementGrille } = useGrillePopUp(popUpActif);
  const { attribuer, peser, estimer, supprimerComptage, supprimerComptageJour, validerReappro } =
    useGererCasesPopUp(popUpActif);
  const { data: mouvementsComptage, isLoading: chargementRapport } = useMouvementsComptage(popUpActif);

  const [vue, setVue] = useState<'boites' | 'catalogue' | 'rapport'>('boites');
  // Seule la position est mémorisée — le contenu est relu à chaque rendu depuis `grille` (source
  // de vérité toujours à jour), pour que le poids saisi apparaisse immédiatement dans la case
  // encore ouverte, sans avoir à la fermer et la rouvrir pour rafraîchir l'affichage.
  const [casePositionOuverte, setCasePositionOuverte] = useState<string | null>(null);
  const contenusOuverts = grille?.find((c) => c.casePosition === casePositionOuverte)?.contenus ?? [];
  const [recherche, setRecherche] = useState('');
  const [pinOuvert, setPinOuvert] = useState<StockPin | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [reapproOuvert, setReapproOuvert] = useState(false);

  const pinsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? (pins ?? []).filter((p) => p.nom.toLowerCase().includes(q)) : (pins ?? []);
  }, [pins, recherche]);

  const rapportParJour = useMemo(() => grouperRapportParJour(mouvementsComptage ?? []), [mouvementsComptage]);
  const reapproLignes = useMemo(() => calculerReapprovisionnement(grille ?? []), [grille]);

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
        {vue === 'catalogue' && (
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
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase text-slate-400">
                Stock compté — {popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
              </Text>
              {estAdmin && popUpActif && (
                <Pressable onPress={() => setReapproOuvert(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5">
                  <Text className="text-xs font-semibold text-white">Créer le réapprovisionnement</Text>
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
              <RapportStock
                rapportParJour={rapportParJour}
                onPressBoite={setCasePositionOuverte}
                onSupprimerBoite={(casePosition, jourISO) =>
                  supprimerComptageJour.mutate({ casePosition, jourISO })
                }
              />
            )}
          </>
        )}
      </ScrollView>

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
          peserEnCours={
            (peser.isPending ? peser.variables?.pinId : null) ??
            (estimer.isPending ? estimer.variables?.pinId : null) ??
            (supprimerComptage.isPending ? supprimerComptage.variables?.pinId : null) ??
            null
          }
          onPeser={(pinId, poidsPese) => {
            const contenu = contenusOuverts.find((c) => c.pin.id === pinId);
            if (!contenu) return;
            peser.mutate({
              boiteId: contenu.boiteId,
              pinId,
              casePosition: casePositionOuverte,
              poidsUnitaire: contenu.pin.poids_unitaire ?? 0,
              poidsPese,
              profileId: profile.id,
            });
          }}
          onEstimer={(pinId, pourcentage) => {
            const contenu = contenusOuverts.find((c) => c.pin.id === pinId);
            if (!contenu) return;
            estimer.mutate({
              boiteId: contenu.boiteId,
              pinId,
              casePosition: casePositionOuverte,
              pourcentage,
              profileId: profile.id,
            });
          }}
          onSupprimerComptage={(pinId) => {
            const contenu = contenusOuverts.find((c) => c.pin.id === pinId);
            if (!contenu) return;
            supprimerComptage.mutate({ boiteId: contenu.boiteId, pinId });
          }}
        />
      )}

      {pinOuvert && <PanneauPin pin={pinOuvert} profile={profile} onFermer={() => setPinOuvert(null)} />}

      {reapproOuvert && popUpActif && (
        <PanneauReapprovisionnement
          lignes={reapproLignes}
          popUpNom={popUps.find((p) => p.id === popUpActif)?.nom ?? ''}
          enCours={validerReappro.isPending}
          onValider={() => validerReappro.mutate(undefined, { onSuccess: () => setReapproOuvert(false) })}
          onFermer={() => setReapproOuvert(false)}
        />
      )}
    </View>
  );
}
