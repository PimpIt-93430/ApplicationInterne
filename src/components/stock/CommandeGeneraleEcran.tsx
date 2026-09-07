import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

import { TYPES_CONSOMMABLES } from '@/api/consommables';
import { calculerCommandes } from '@/api/stock';
import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { FeuilleModale } from '@/components/ui/FeuilleModale';
import { BarreOnglets } from '@/components/ui/BarreOnglets';
import { PanneauPreparationCommande } from '@/components/stock/StockScreen';
import {
  useCommandeActiveConsommables,
  useCommandesConsommablesTerminees,
  useConsommablesEnAttenteLocal,
  useGererCommandeConsommables,
} from '@/hooks/useConsommables';
import {
  useChaussuresInventaires,
  useChaussuresStock,
  useMappingSumupChaussures,
  useVentesSumupLignes,
} from '@/hooks/useChaussures';
import { useCoquesInventaires, useCoquesStock, useMappingSumupCoques } from '@/hooks/useCoques';
import { useSacsInventaires, useSacsStock, useMappingSumupSacs } from '@/hooks/useSacs';
import {
  useCommandeActiveProduits,
  useCommandeDetailProduits,
  useCommandesEnAttenteLocalProduits,
  useCommandesTermineesProduits,
  useGererCommandeProduits,
  useGererPreparationCommandeProduits,
} from '@/hooks/useProduits';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import {
  useCommandeActivePopUp,
  useCommandesEnAttenteLocal,
  useCommandesTerminees,
  useGererCommandePopUp,
  useGererPreparationCommande,
  useGrillePopUp,
} from '@/hooks/useStock';
import { calculerARamener, resoudreVentesSumup } from '@/utils/chaussures';
import { calculerARamenerCoques, resoudreVentesSumupCoques } from '@/utils/coques';
import { calculerARamenerSacs, resoudreVentesSumupSacs } from '@/utils/sacs';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';
import { useCommandeQuantitesStore } from '@/store/useCommandeQuantitesStore';
import type { CategorieProduit, Profile, TypeConsommable } from '@/types/database.types';

const LABEL_CATEGORIE: Record<CategorieProduit, string> = { chaussures: 'Chaussures', coques: 'Coques', sacs: 'Sacs' };
const LABEL_TYPE_CONSOMMABLE: Record<TypeConsommable, string> = Object.fromEntries(
  TYPES_CONSOMMABLES.map((t) => [t.valeur, t.label]),
) as Record<TypeConsommable, string>;

interface LigneProduitCandidate {
  categorie: CategorieProduit;
  produitId: string;
  libelle: string;
  quantite: number;
}

/** Rassemble les "à ramener" des 3 catégories de Produits pour ce pop-up — même calcul que les
 * onglets Réappro de Chaussures/Coques/Sacs (calculerARamener*), jusqu'ici seulement affiché à
 * titre indicatif dans chaque écran séparé, jamais relié à un vrai envoi de commande. */
function useProduitsACommander(popUpId: string | undefined): { lignes: LigneProduitCandidate[]; chargement: boolean } {
  const { data: stockChaussures, isLoading: c1 } = useChaussuresStock();
  const { data: inventairesChaussures, isLoading: c2 } = useChaussuresInventaires(popUpId);
  const { data: ventesLignes } = useVentesSumupLignes(popUpId);
  const { data: mappingChaussures } = useMappingSumupChaussures();

  const { data: stockCoques, isLoading: c3 } = useCoquesStock();
  const { data: inventairesCoques, isLoading: c4 } = useCoquesInventaires(popUpId);
  const { data: mappingCoques } = useMappingSumupCoques();

  const { data: stockSacs, isLoading: c5 } = useSacsStock();
  const { data: inventairesSacs, isLoading: c6 } = useSacsInventaires(popUpId);
  const { data: mappingSacs } = useMappingSumupSacs();

  const lignes = useMemo(() => {
    if (!popUpId) return [];
    const resultat: LigneProduitCandidate[] = [];

    // Chaussures — cf. utils/chaussures.ts resoudreVentesSumup (parsing description en priorité,
    // repli sur le mapping nom→couleur/taille).
    const ventesChaussures = resoudreVentesSumup(ventesLignes ?? [], mappingChaussures ?? []);
    for (const item of calculerARamener(stockChaussures ?? [], inventairesChaussures ?? [], ventesChaussures)) {
      if (item.aRamener <= 0) continue;
      resultat.push({ categorie: 'chaussures', produitId: item.id, libelle: `${item.couleur} — ${item.taille}`, quantite: item.aRamener });
    }

    const ventesCoques = resoudreVentesSumupCoques(ventesLignes ?? [], mappingCoques ?? []);
    for (const item of calculerARamenerCoques(stockCoques ?? [], inventairesCoques ?? [], ventesCoques)) {
      if (item.aRamener <= 0) continue;
      resultat.push({
        categorie: 'coques',
        produitId: item.id,
        libelle: `${item.modele} — ${item.variante} — ${item.couleur}`,
        quantite: item.aRamener,
      });
    }

    const ventesSacs = resoudreVentesSumupSacs(ventesLignes ?? [], mappingSacs ?? []);
    for (const item of calculerARamenerSacs(stockSacs ?? [], inventairesSacs ?? [], ventesSacs)) {
      if (item.aRamener <= 0) continue;
      resultat.push({ categorie: 'sacs', produitId: item.id, libelle: `${item.produit} — ${item.couleur}`, quantite: item.aRamener });
    }

    return resultat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    popUpId,
    stockChaussures,
    inventairesChaussures,
    ventesLignes,
    mappingChaussures,
    stockCoques,
    inventairesCoques,
    mappingCoques,
    stockSacs,
    inventairesSacs,
    mappingSacs,
  ]);

  return { lignes, chargement: c1 || c2 || c3 || c4 || c5 || c6 };
}

function CaseACocher({ coche }: { coche: boolean }) {
  return (
    <View className={`h-6 w-6 items-center justify-center rounded-md border-2 ${coche ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'}`}>
      {coche && <Text className="text-xs font-bold text-white">✓</Text>}
    </View>
  );
}

function LigneCheckable({ label, sousLigne, coche, onPress }: { label: string; sousLigne?: string; coche: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="mb-1.5 flex-row items-center justify-between rounded-xl bg-white p-3 shadow-sm">
      <View className="flex-1 pr-2">
        <Text className="text-sm font-semibold text-slate-800">{label}</Text>
        {!!sousLigne && <Text className="text-xs text-slate-400">{sousLigne}</Text>}
      </View>
      <CaseACocher coche={coche} />
    </Pressable>
  );
}

function CarteStatutCommande({
  titre,
  texte,
  couleur,
  onPress,
}: {
  titre: string;
  texte: string;
  couleur: 'amber' | 'emerald';
  onPress?: () => void;
}) {
  const classes = couleur === 'amber' ? 'bg-amber-50' : 'bg-emerald-50';
  const classesTexte = couleur === 'amber' ? 'text-amber-700' : 'text-emerald-700';
  const Conteneur = onPress ? Pressable : View;
  return (
    <Conteneur onPress={onPress} className={`mb-4 rounded-2xl p-3.5 ${classes}`}>
      <Text className={`mb-0.5 text-xs font-bold uppercase tracking-wide ${classesTexte}`}>{titre}</Text>
      <Text className={`text-sm font-semibold ${classesTexte}`}>{texte}</Text>
    </Conteneur>
  );
}

interface HistoriqueItem {
  cle: string;
  categorie: 'Pin\'s' | 'Produits' | 'Consommables';
  date: string;
  nbLignes: number;
}

/** "Commande actuelle" + "Historique" côté pop-up : rassemble en une seule composition les pin's
 * signalés "à commander", les Produits calculés en réappro et les consommables cochés à la main —
 * cf. retour utilisateur du 2026-09-07 : "tu check la commande et tu l'envoies" en un seul geste,
 * là où jusqu'ici seuls les pin's avaient un circuit d'envoi complet. */
function VueCommandePopUp({ popUpId, popUpNom, profile }: { popUpId: string; popUpNom: string; profile: Profile }) {
  const [onglet, setOnglet] = useState<'actuelle' | 'historique'>('actuelle');

  // Pin's
  const { data: grille } = useGrillePopUp(popUpId);
  const { data: commandePins } = useCommandeActivePopUp(popUpId);
  const { envoyer: envoyerPins, marquerRecue: marquerRecuePins } = useGererCommandePopUp(popUpId);
  const lignesPins = useMemo(() => calculerCommandes(grille ?? []), [grille]);
  const [pinsExclus, setPinsExclus] = useState<Set<string>>(new Set());
  // Quantité par pin — même store que le bouton "Voir la commande et ajuster les quantités" de
  // l'écran Pin's, pour qu'un ajustement fait là-bas soit repris ici au moment de l'envoi.
  const quantites = useCommandeQuantitesStore((s) => s.quantites);
  const reinitialiserQuantites = useCommandeQuantitesStore((s) => s.reinitialiser);

  // Produits
  const { lignes: produitsCandidats } = useProduitsACommander(popUpId);
  const { data: commandeProduits } = useCommandeActiveProduits(popUpId);
  const { envoyer: envoyerProduits, marquerRecue: marquerRecueProduits } = useGererCommandeProduits(popUpId);
  const [produitsExclus, setProduitsExclus] = useState<Set<string>>(new Set());

  // Consommables
  const { data: commandeConsommables } = useCommandeActiveConsommables(popUpId);
  const { demander: demanderConsommables, marquerRecue: marquerRecueConsommables } = useGererCommandeConsommables(popUpId);
  const [consommablesChoisis, setConsommablesChoisis] = useState<Set<TypeConsommable>>(new Set());

  // Historique
  const { data: histoPins } = useCommandesTerminees(popUpId);
  const { data: histoProduits } = useCommandesTermineesProduits(popUpId);
  const { data: histoConsommables } = useCommandesConsommablesTerminees(popUpId);

  const historique = useMemo<HistoriqueItem[]>(() => {
    const items: HistoriqueItem[] = [
      ...(histoPins ?? []).map((h) => ({ cle: `pin-${h.commande.id}`, categorie: 'Pin\'s' as const, date: h.commande.envoyee_at, nbLignes: h.nbPins })),
      ...(histoProduits ?? []).map((h) => ({ cle: `prod-${h.commande.id}`, categorie: 'Produits' as const, date: h.commande.demandee_at, nbLignes: h.nbLignes })),
      ...(histoConsommables ?? []).map((h) => ({ cle: `conso-${h.commande.id}`, categorie: 'Consommables' as const, date: h.commande.demandee_at, nbLignes: h.nbLignes })),
    ];
    return items.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [histoPins, histoProduits, histoConsommables]);

  const lignesPinsRetenues = lignesPins.filter((l) => !pinsExclus.has(l.pin.id));
  const produitsRetenus = produitsCandidats.filter((l) => !produitsExclus.has(l.produitId));

  const totalRetenu = (commandePins ? 0 : lignesPinsRetenues.length) + (commandeProduits ? 0 : produitsRetenus.length) + (commandeConsommables ? 0 : consommablesChoisis.size);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const envoyerTout = async () => {
    if (!profile || totalRetenu === 0) return;
    setEnvoiEnCours(true);
    try {
      if (!commandePins && lignesPinsRetenues.length > 0) {
        await envoyerPins.mutateAsync({
          profileId: profile.id,
          lignes: lignesPinsRetenues.map((l) => ({ pinId: l.pin.id, quantite: quantites[l.pin.id] ?? 100 })),
        });
        reinitialiserQuantites(lignesPinsRetenues.map((l) => l.pin.id));
      }
      if (!commandeProduits && produitsRetenus.length > 0) {
        await envoyerProduits.mutateAsync({
          profileId: profile.id,
          lignes: produitsRetenus.map((l) => ({ categorie: l.categorie, produitId: l.produitId, libelle: l.libelle, quantite: l.quantite })),
        });
      }
      if (!commandeConsommables && consommablesChoisis.size > 0) {
        await demanderConsommables.mutateAsync({
          profileId: profile.id,
          lignes: [...consommablesChoisis].map((type) => ({ type, description: null })),
        });
      }
      setPinsExclus(new Set());
      setProduitsExclus(new Set());
      setConsommablesChoisis(new Set());
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "Une partie de la commande n'a pas pu être envoyée.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const confirmerEnvoi = () => {
    Alert.alert('Envoyer la commande au local', `Le local va préparer tout ça pour ${popUpNom}.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Envoyer', onPress: envoyerTout },
    ]);
  };

  return (
    <View className="flex-1">
      <View className="px-4 pt-4">
        <BarreOnglets
          valeur={onglet}
          onChange={setOnglet}
          options={[
            { valeur: 'actuelle', label: 'Commande actuelle' },
            { valeur: 'historique', label: 'Historique' },
          ]}
        />
      </View>

      {onglet === 'historique' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {historique.length === 0 ? (
            <Text className="text-sm text-slate-400">Aucune commande envoyée pour l'instant.</Text>
          ) : (
            historique.map((h) => (
              <View key={h.cle} className="mb-1.5 flex-row items-center justify-between rounded-xl bg-white p-3 shadow-sm">
                <View>
                  <Text className="text-sm font-semibold text-slate-800">{h.categorie}</Text>
                  <Text className="text-xs text-slate-400">{format(new Date(h.date), "d MMM yyyy 'à' HH:mm", { locale: fr })}</Text>
                </View>
                <Text className="text-sm font-bold text-slate-500">{h.nbLignes} article{h.nbLignes > 1 ? 's' : ''}</Text>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Pin's</Text>
          {commandePins ? (
            commandePins.commande.statut === 'prete' ? (
              <CarteStatutCommande
                titre="Pin's — prête"
                texte="À récupérer au local."
                couleur="emerald"
                onPress={() =>
                  Alert.alert('Commande reçue', 'Confirmer que la commande de pin\'s a bien été récupérée ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Confirmer', onPress: () => marquerRecuePins.mutate({ commandeId: commandePins.commande.id, profileId: profile.id }) },
                  ])
                }
              />
            ) : (
              <CarteStatutCommande titre="Pin's — envoyée" texte="En préparation par le local." couleur="amber" />
            )
          ) : lignesPins.length === 0 ? (
            <Text className="mb-4 text-sm text-slate-400">Rien à commander pour l'instant.</Text>
          ) : (
            <View className="mb-4">
              {lignesPins.map((l) => (
                <LigneCheckable
                  key={l.pin.id}
                  label={l.pin.nom}
                  sousLigne={`${l.nbBoites} boîte(s) — ${quantites[l.pin.id] ?? 100} à envoyer`}
                  coche={!pinsExclus.has(l.pin.id)}
                  onPress={() =>
                    setPinsExclus((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.pin.id)) next.delete(l.pin.id);
                      else next.add(l.pin.id);
                      return next;
                    })
                  }
                />
              ))}
            </View>
          )}

          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Produits (chaussures, coques, sacs)</Text>
          {commandeProduits ? (
            commandeProduits.commande.statut === 'envoyee' ? (
              <CarteStatutCommande
                titre="Produits — prête"
                texte="À récupérer au local."
                couleur="emerald"
                onPress={() =>
                  Alert.alert('Commande reçue', 'Confirmer que la commande de produits a bien été récupérée ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Confirmer', onPress: () => marquerRecueProduits.mutate({ commandeId: commandeProduits.commande.id, profileId: profile.id }) },
                  ])
                }
              />
            ) : (
              <CarteStatutCommande titre="Produits — demandée" texte="En préparation par le local." couleur="amber" />
            )
          ) : produitsCandidats.length === 0 ? (
            <Text className="mb-4 text-sm text-slate-400">Rien à ramener pour l'instant.</Text>
          ) : (
            <View className="mb-4">
              {produitsCandidats.map((l) => (
                <LigneCheckable
                  key={l.produitId}
                  label={l.libelle}
                  sousLigne={`${LABEL_CATEGORIE[l.categorie]} — ${l.quantite} à ramener`}
                  coche={!produitsExclus.has(l.produitId)}
                  onPress={() =>
                    setProduitsExclus((prev) => {
                      const next = new Set(prev);
                      if (next.has(l.produitId)) next.delete(l.produitId);
                      else next.add(l.produitId);
                      return next;
                    })
                  }
                />
              ))}
            </View>
          )}

          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Consommables</Text>
          {commandeConsommables ? (
            commandeConsommables.commande.statut === 'envoyee' ? (
              <CarteStatutCommande
                titre="Consommables — prêts"
                texte="À récupérer au local."
                couleur="emerald"
                onPress={() =>
                  Alert.alert('Commande reçue', 'Confirmer que les consommables ont bien été récupérés ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Confirmer', onPress: () => marquerRecueConsommables.mutate({ commandeId: commandeConsommables.commande.id, profileId: profile.id }) },
                  ])
                }
              />
            ) : (
              <CarteStatutCommande titre="Consommables — demandés" texte="En préparation par le local." couleur="amber" />
            )
          ) : (
            <View className="mb-4">
              {TYPES_CONSOMMABLES.map((t) => (
                <LigneCheckable
                  key={t.valeur}
                  label={t.label}
                  coche={consommablesChoisis.has(t.valeur)}
                  onPress={() =>
                    setConsommablesChoisis((prev) => {
                      const next = new Set(prev);
                      if (next.has(t.valeur)) next.delete(t.valeur);
                      else next.add(t.valeur);
                      return next;
                    })
                  }
                />
              ))}
            </View>
          )}

          <Pressable
            onPress={confirmerEnvoi}
            disabled={totalRetenu === 0 || envoiEnCours}
            className={`mt-2 items-center rounded-2xl py-4 ${totalRetenu === 0 ? 'bg-slate-200' : 'bg-indigo-600'}`}
          >
            <Text className={`text-base font-bold ${totalRetenu === 0 ? 'text-slate-500' : 'text-white'}`}>
              {envoiEnCours ? 'Envoi…' : `Envoyer la commande${totalRetenu > 0 ? ` (${totalRetenu})` : ''}`}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

/** Préparation d'une commande de Produits par le local — même principe que
 * PanneauPreparationCommande (pin's) : coche chaque ligne, "Tout cocher", puis marque envoyée. */
function PanneauPreparationCommandeProduits({ commandeId, profile, onFermer }: { commandeId: string; profile: Profile; onFermer: () => void }) {
  const { data } = useCommandeDetailProduits(commandeId);
  const { basculerFait, basculerTout, marquerEnvoyee } = useGererPreparationCommandeProduits();

  if (!data) {
    return (
      <FeuilleModale onClose={onFermer}>
        <ActivityIndicator color="#6366F1" />
      </FeuilleModale>
    );
  }

  const { commande, popUpNom, lignes } = data;
  const toutCoche = lignes.length > 0 && lignes.every((l) => l.fait);

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-1 text-lg font-bold text-slate-900">Produits — {popUpNom}</Text>
      <Text className="mb-3 text-sm text-slate-400">Coche chaque article préparé, puis marque la commande comme envoyée.</Text>

      <Pressable onPress={() => basculerTout.mutate({ commandeId, fait: !toutCoche })} className="mb-3 self-start">
        <Text className="text-sm font-semibold text-indigo-600">{toutCoche ? 'Tout décocher' : 'Tout cocher'}</Text>
      </Pressable>

      <ScrollView style={{ maxHeight: 420 }}>
        {lignes.map((ligne) => (
          <Pressable
            key={ligne.id}
            onPress={() => basculerFait.mutate({ ligneId: ligne.id, commandeId, fait: !ligne.fait })}
            className={`mb-2 flex-row items-center justify-between rounded-xl p-3 ${ligne.fait ? 'bg-emerald-50' : 'bg-slate-50'}`}
          >
            <View className="flex-1 pr-2">
              <Text className={`text-sm font-semibold ${ligne.fait ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{ligne.libelle}</Text>
              <Text className="text-xs text-slate-400">{LABEL_CATEGORIE[ligne.categorie]} — quantité {ligne.quantite}</Text>
            </View>
            <CaseACocher coche={ligne.fait} />
          </Pressable>
        ))}
      </ScrollView>

      {commande.statut === 'demandee' && (
        <Pressable
          onPress={() => marquerEnvoyee.mutate({ commandeId, profileId: profile.id }, { onSuccess: onFermer })}
          disabled={marquerEnvoyee.isPending}
          className="mt-4 items-center rounded-xl bg-emerald-600 py-3.5"
        >
          <Text className="text-base font-bold text-white">{marquerEnvoyee.isPending ? 'Validation…' : 'Marquer comme envoyée'}</Text>
        </Pressable>
      )}
      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}

/** Préparation d'une demande de consommables par le local — pas de coche ligne par ligne (liste
 * fixe et courte), juste la liste demandée + le bouton "marquer envoyée". */
function PanneauConsommablesLocal({ popUpId, profile, onFermer }: { popUpId: string; profile: Profile; onFermer: () => void }) {
  const { data: commandeActive } = useCommandeActiveConsommables(popUpId);
  const { marquerEnvoyee } = useGererCommandeConsommables(popUpId);

  if (!commandeActive) {
    return (
      <FeuilleModale onClose={onFermer}>
        <ActivityIndicator color="#6366F1" />
      </FeuilleModale>
    );
  }

  return (
    <FeuilleModale onClose={onFermer}>
      <Text className="mb-3 text-lg font-bold text-slate-900">Consommables</Text>
      <ScrollView style={{ maxHeight: 420 }}>
        {commandeActive.lignes.map((ligne) => (
          <View key={ligne.id} className="mb-2 rounded-xl bg-slate-50 p-3">
            <Text className="text-sm font-semibold text-slate-800">{LABEL_TYPE_CONSOMMABLE[ligne.type]}</Text>
            {!!ligne.description && <Text className="mt-0.5 text-xs text-slate-400">{ligne.description}</Text>}
          </View>
        ))}
      </ScrollView>
      <Pressable
        onPress={() => marquerEnvoyee.mutate({ commandeId: commandeActive.commande.id, profileId: profile.id }, { onSuccess: onFermer })}
        disabled={marquerEnvoyee.isPending}
        className="mt-4 items-center rounded-xl bg-emerald-600 py-3.5"
      >
        <Text className="text-base font-bold text-white">{marquerEnvoyee.isPending ? 'Validation…' : 'Marquer comme envoyée'}</Text>
      </Pressable>
      <Pressable onPress={onFermer} className="mt-3 items-center py-2">
        <Text className="font-semibold text-indigo-600">Fermer</Text>
      </Pressable>
    </FeuilleModale>
  );
}

type CommandeOuverte = { type: 'pins' | 'produits' | 'consommables'; id: string; popUpId: string } | null;

/** "Voir les commandes" côté local : les demandes en attente des 3 catégories, tous pop-ups
 * confondus, en une seule liste — cf. retour utilisateur du 2026-09-07 : jusqu'ici seuls les pin's
 * avaient cette vue (VueCommandesLocal dans StockScreen), produits n'avait aucun écran et
 * consommables obligeait à rebasculer le sélecteur de pop-up un par un. */
function VueCommandesLocalGenerale({ profile, onOuvrir }: { profile: Profile; onOuvrir: (c: CommandeOuverte) => void }) {
  const { data: commandesPins, isLoading: l1 } = useCommandesEnAttenteLocal();
  const { data: commandesProduits, isLoading: l2 } = useCommandesEnAttenteLocalProduits();
  const { data: commandesConsommables, isLoading: l3 } = useConsommablesEnAttenteLocal();
  const chargement = l1 || l2 || l3;

  const total = (commandesPins?.length ?? 0) + (commandesProduits?.length ?? 0) + (commandesConsommables?.length ?? 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 960, width: '100%', alignSelf: 'center' }}>
      <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Commandes</Text>
      <Text className="mb-3 text-xs text-slate-400">Demandes envoyées par les pop-ups, tous types confondus.</Text>

      {chargement ? (
        <ActivityIndicator color="#6366F1" />
      ) : total === 0 ? (
        <Text className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          Aucune commande en attente.
        </Text>
      ) : (
        <>
          {(commandesPins ?? []).map((c) => (
            <Pressable
              key={`pin-${c.commande.id}`}
              onPress={() => onOuvrir({ type: 'pins', id: c.commande.id, popUpId: c.commande.pop_up_id })}
              className="mb-2 flex-row items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800">{c.popUpNom} — Pin's</Text>
                <Text className="mt-0.5 text-xs text-slate-400">{c.nbFaites}/{c.nbLignes} pin(s) prêt(s)</Text>
              </View>
              <Text className="text-lg text-indigo-400">›</Text>
            </Pressable>
          ))}
          {(commandesProduits ?? []).map((c) => (
            <Pressable
              key={`prod-${c.commande.id}`}
              onPress={() => onOuvrir({ type: 'produits', id: c.commande.id, popUpId: c.commande.pop_up_id })}
              className="mb-2 flex-row items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800">{c.popUpNom} — Produits</Text>
                <Text className="mt-0.5 text-xs text-slate-400">{c.nbFaites}/{c.nbLignes} article(s) prêt(s)</Text>
              </View>
              <Text className="text-lg text-indigo-400">›</Text>
            </Pressable>
          ))}
          {(commandesConsommables ?? []).map((c) => (
            <Pressable
              key={`conso-${c.commande.id}`}
              onPress={() => onOuvrir({ type: 'consommables', id: c.commande.id, popUpId: c.commande.pop_up_id })}
              className="mb-2 flex-row items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-800">{c.popUpNom} — Consommables</Text>
                <Text className="mt-0.5 text-xs text-slate-400">{c.nbLignes} type(s) demandé(s)</Text>
              </View>
              <Text className="text-lg text-indigo-400">›</Text>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

/** Point d'entrée "Voir la commande" (Stock) — bascule automatiquement entre la vue pop-up (compose
 * + historique) et la vue locale ("Voir les commandes", toutes catégories) selon le lieu
 * sélectionné, même principe que StockScreen pour les pin's (cf. estVueLocaleActive). */
export function CommandeGeneraleEcran({
  profile,
  onRetour,
  popUpId,
}: {
  profile: Profile;
  onRetour: () => void;
  popUpId: string | undefined;
  // Non utilisé ici (contrairement à StockScreen/ConsommablesScreen) : le sélecteur de lieu vit
  // uniquement sur l'écran menu de StockAccueil, cette prop n'existe que pour garder la même
  // signature d'appel que les autres écrans de catégorie.
  onChangePopUpId: (id: string) => void;
}) {
  const estAdmin = profile.role === 'admin';
  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const popUps = estAdmin ? (popUpsTous ?? []) : popUpsAttribues(profile, mapAffectations, popUpsTous ?? []);
  const popUpActif = popUpId ?? popUps[0]?.id;

  const popUpLocal = useMemo(() => popUpsTous?.find((p) => p.est_local), [popUpsTous]);
  const estAuLocal = !!popUpLocal && (mapAffectations.get(profile.id)?.has(popUpLocal.id) ?? false);
  const estVueLocaleActive = !!popUpLocal && popUpActif === popUpLocal.id && (estAdmin || estAuLocal);

  const [commandeOuverte, setCommandeOuverte] = useState<CommandeOuverte>(null);
  // Nécessaire pour le panneau pin's (basculerFait/basculerTout/validerPrete viennent d'un hook
  // partagé, pas propre à une commande) — récupéré ici plutôt que dans PanneauPreparationCommande
  // lui-même pour rester identique à son usage dans StockScreen.
  const { basculerFait, basculerTout, validerPrete } = useGererPreparationCommande();

  const popUpActifNom = popUps.find((p) => p.id === popUpActif)?.nom ?? '—';

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Voir la commande" onRetour={onRetour} />

      {!popUpActif ? (
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-sm text-slate-400">Aucun lieu attribué pour l'instant — demande à un admin de t'en attribuer un.</Text>
        </View>
      ) : estVueLocaleActive ? (
        <VueCommandesLocalGenerale profile={profile} onOuvrir={setCommandeOuverte} />
      ) : (
        <VueCommandePopUp popUpId={popUpActif} popUpNom={popUpActifNom} profile={profile} />
      )}

      {commandeOuverte?.type === 'pins' && (
        <PanneauPreparationCommande
          commandeId={commandeOuverte.id}
          profile={profile}
          basculerFait={basculerFait}
          basculerTout={basculerTout}
          validerPrete={validerPrete}
          onFermer={() => setCommandeOuverte(null)}
        />
      )}
      {commandeOuverte?.type === 'produits' && (
        <PanneauPreparationCommandeProduits commandeId={commandeOuverte.id} profile={profile} onFermer={() => setCommandeOuverte(null)} />
      )}
      {commandeOuverte?.type === 'consommables' && (
        <PanneauConsommablesLocal popUpId={commandeOuverte.popUpId} profile={profile} onFermer={() => setCommandeOuverte(null)} />
      )}
    </View>
  );
}
