import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { CommandeGeneraleEcran } from '@/components/stock/CommandeGeneraleEcran';
import { SaisieConsommablesScreen } from '@/components/stock/SaisieConsommablesScreen';
import { SaisieProduitsScreen } from '@/components/stock/SaisieProduitsScreen';
import { StockScreen } from '@/components/stock/StockScreen';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { Dropdown } from '@/components/ui/Dropdown';
import { useCommandeActiveConsommables, useGererCommandeConsommables } from '@/hooks/useConsommables';
import { usePopUps } from '@/hooks/usePopUps';
import { useCommandeActiveProduits, useGererCommandeProduits } from '@/hooks/useProduits';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import { useCommandeActivePopUp, useGererCommandePopUp } from '@/hooks/useStock';
import {
  ORDRE_COLONNE_STOCK,
  useStatutsStock,
  type CategorieColonneStock,
  type StatutCategorieStock,
} from '@/hooks/useStatutsStock';
import type { Profile } from '@/types/database.types';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';

type Ecran = 'menu' | CategorieColonneStock | 'commande';

const PRESENTATION: Record<CategorieColonneStock, { label: string; icone: keyof typeof Ionicons.glyphMap }> = {
  pins: { label: "Pin's", icone: 'grid' },
  chaussures: { label: 'Chaussures', icone: 'footsteps' },
  coques: { label: 'Coques', icone: 'phone-portrait' },
  sacs: { label: 'Sacs & pochettes', icone: 'bag-handle' },
  lanieres: { label: 'Lanières', icone: 'link' },
  consommables: { label: 'Consommables', icone: 'cube' },
};

/** Une ligne de la colonne : verte une fois la catégorie faite, sinon blanche "à faire". */
function LigneCategorie({
  categorie,
  statut,
  onPress,
}: {
  categorie: CategorieColonneStock;
  statut: StatutCategorieStock;
  onPress: () => void;
}) {
  const { label, icone } = PRESENTATION[categorie];
  return (
    <Pressable
      onPress={onPress}
      className={`mb-2.5 flex-row items-center rounded-2xl border p-4 ${
        statut.vert ? 'border-emerald-300 bg-emerald-500' : 'border-slate-200 bg-white'
      }`}
    >
      <View className={`mr-3 h-10 w-10 items-center justify-center rounded-xl ${statut.vert ? 'bg-white/25' : 'bg-slate-100'}`}>
        <Ionicons name={icone} size={20} color={statut.vert ? 'white' : '#475569'} />
      </View>
      <View className="flex-1">
        <Text className={`text-base font-bold ${statut.vert ? 'text-white' : 'text-slate-900'}`}>{label}</Text>
        <Text className={`text-xs ${statut.vert ? 'text-white/90' : 'text-slate-400'}`}>{statut.detail}</Text>
      </View>
      <Ionicons name={statut.vert ? 'checkmark-circle' : 'chevron-forward'} size={22} color={statut.vert ? 'white' : '#94A3B8'} />
    </Pressable>
  );
}

/** Bandeau en haut de la colonne tant qu'une commande est en cours au local (retour utilisateur du
 * 2026-10-26) : un seul clic "J'ai tout reçu" clôt d'un coup tout ce qui est en vol (pin's,
 * produits, consommables) — avant, la réception se cachait dans l'écran d'envoi et n'était jamais
 * confirmée, ce qui bloquait les commandes suivantes. */
function BandeauCommandeEnCours({ popUpId, profile }: { popUpId: string; profile: Profile }) {
  const { data: commandePins } = useCommandeActivePopUp(popUpId);
  const { data: commandeProduits } = useCommandeActiveProduits(popUpId);
  const { data: commandeConsommables } = useCommandeActiveConsommables(popUpId);
  const { marquerRecue: marquerRecuePins } = useGererCommandePopUp(popUpId);
  const { marquerRecue: marquerRecueProduits } = useGererCommandeProduits(popUpId);
  const { marquerRecue: marquerRecueConsommables } = useGererCommandeConsommables(popUpId);
  const [enCours, setEnCours] = useState(false);

  const familles = [
    commandePins && { label: "Pin's", prete: commandePins.commande.statut === 'prete' },
    commandeProduits && { label: 'Produits', prete: commandeProduits.commande.statut === 'envoyee' },
    commandeConsommables && { label: 'Consommables', prete: commandeConsommables.commande.statut === 'envoyee' },
  ].filter((f): f is { label: string; prete: boolean } => !!f);
  if (familles.length === 0) return null;
  const toutPret = familles.every((f) => f.prete);

  const toutRecevoir = async () => {
    setEnCours(true);
    try {
      if (commandePins) await marquerRecuePins.mutateAsync({ commandeId: commandePins.commande.id, profileId: profile.id });
      if (commandeProduits) await marquerRecueProduits.mutateAsync({ commandeId: commandeProduits.commande.id, profileId: profile.id });
      if (commandeConsommables) await marquerRecueConsommables.mutateAsync({ commandeId: commandeConsommables.commande.id, profileId: profile.id });
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : "La réception n'a pas pu être enregistrée.");
    } finally {
      setEnCours(false);
    }
  };

  const confirmer = () => {
    const pasPret = familles.filter((f) => !f.prete).map((f) => f.label);
    const avertissement = pasPret.length > 0 ? `\n\nAttention, encore en préparation au local : ${pasPret.join(', ')}.` : '';
    Alert.alert("J'ai tout reçu", `Ça clôt toute la commande en cours (${familles.map((f) => f.label).join(', ')}).${avertissement}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: toutRecevoir },
    ]);
  };

  return (
    <Pressable
      onPress={confirmer}
      disabled={enCours}
      className={`mb-3 flex-row items-center rounded-2xl p-4 ${toutPret ? 'bg-emerald-500' : 'bg-amber-500'}`}
    >
      <Ionicons name={toutPret ? 'cube' : 'time'} size={22} color="white" />
      <View className="ml-3 flex-1">
        <Text className="text-base font-bold text-white">
          {toutPret ? 'Commande prête au local' : 'Commande en cours au local'}
        </Text>
        <Text className="text-xs text-white/90">
          {familles.map((f) => `${f.label} : ${f.prete ? 'prête' : 'en préparation'}`).join(' · ')}
        </Text>
        <Text className="mt-1 text-xs font-semibold text-white">Touche ici quand tu as tout reçu</Text>
      </View>
      {enCours ? <ActivityIndicator color="white" /> : <Ionicons name="checkmark-done" size={22} color="white" />}
    </Pressable>
  );
}

/** Colonne Stock d'un pop-up (retour utilisateur du 2026-10-23) : Pin's en premier puis chaque
 * produit et les consommables, chacun cliquable et vert une fois fait, puis "Envoyer la commande"
 * en bas (toujours utilisable — l'écran d'envoi prévient s'il reste des cases à faire). */
function ColonneStock({ popUpId, onOuvrir }: { popUpId: string; onOuvrir: (e: Ecran) => void }) {
  const { statuts, nonVertes, chargement } = useStatutsStock(popUpId);

  if (chargement) return <ActivityIndicator color="#6366F1" style={{ marginTop: 24 }} />;

  return (
    <>
      {ORDRE_COLONNE_STOCK.map((categorie) => (
        <LigneCategorie key={categorie} categorie={categorie} statut={statuts[categorie]} onPress={() => onOuvrir(categorie)} />
      ))}
      {nonVertes.length === 0 ? (
        <Text className="mb-2 mt-2 text-center text-xs text-slate-400">Tout est vert, tu peux envoyer la commande.</Text>
      ) : (
        <View className="mb-2 mt-2 rounded-xl bg-amber-50 p-3">
          <Text className="text-center text-xs font-semibold text-amber-700">
            Pas encore fait : {nonVertes.map((c) => PRESENTATION[c].label).join(', ')}
          </Text>
        </View>
      )}
      <Pressable
        onPress={() => onOuvrir('commande')}
        className={`items-center rounded-2xl py-4 ${nonVertes.length === 0 ? 'bg-indigo-600' : 'bg-indigo-400'}`}
      >
        <Text className="text-base font-bold text-white">Envoyer la commande</Text>
      </Pressable>
    </>
  );
}

/** Point d'entrée de Stock. Le choix du pop-up se fait une seule fois ici et reste le même dans
 * chaque catégorie. Un admin choisit parmi tous les lieux ; un non-admin n'a le choix que s'il est
 * attribué à plusieurs pop-ups, sinon son unique lieu s'affiche sans sélecteur. Le Local garde son
 * propre menu (Pin's = stock local/préparation, et la liste des commandes reçues des pop-ups). */
export function StockAccueil({ profile }: { profile: Profile }) {
  const [ecran, setEcran] = useState<Ecran>('menu');
  const estAdmin = profile.role === 'admin';

  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const mesPopUps = estAdmin ? (popUpsTous ?? []) : popUpsAttribues(profile, mapAffectations, popUpsTous ?? []);
  const plusieursPopUps = estAdmin || mesPopUps.length > 1;

  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  const popUpActif = popUpId ?? mesPopUps[0]?.id;
  const monPopUp = mesPopUps.find((p) => p.id === popUpActif);

  const popUpLocal = useMemo(() => popUpsTous?.find((p) => p.est_local), [popUpsTous]);
  const estAuLocal = !!popUpLocal && (mapAffectations.get(profile.id)?.has(popUpLocal.id) ?? false);
  const estVueLocale = !!popUpLocal && popUpActif === popUpLocal.id && (estAdmin || estAuLocal);

  const retourMenu = () => setEcran('menu');

  if (ecran === 'pins') {
    return <StockScreen profile={profile} onRetour={retourMenu} popUpId={popUpActif} onChangePopUpId={setPopUpId} />;
  }
  if (ecran === 'chaussures' || ecran === 'coques' || ecran === 'sacs' || ecran === 'lanieres') {
    return <SaisieProduitsScreen categorie={ecran} popUpId={popUpActif} profile={profile} onRetour={retourMenu} />;
  }
  if (ecran === 'consommables') {
    return <SaisieConsommablesScreen popUpId={popUpActif} profile={profile} onRetour={retourMenu} />;
  }
  if (ecran === 'commande') {
    return <CommandeGeneraleEcran profile={profile} onRetour={retourMenu} popUpId={popUpActif} onChangePopUpId={setPopUpId} />;
  }

  return (
    <View className="flex-1 bg-slate-50">
      {plusieursPopUps ? (
        <>
          <EnteteMenu titre="Stock" />
          <View className="px-4 pb-2">
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Pop-up</Text>
            <Dropdown
              value={popUpActif}
              options={mesPopUps.map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
              onChange={setPopUpId}
            />
          </View>
        </>
      ) : (
        <View className="items-center px-4 pb-2 pt-14">
          <Text className="text-3xl font-bold text-slate-900">{monPopUp?.nom ?? ''}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: Platform.OS === 'web' ? 560 : undefined, width: '100%', alignSelf: 'center' }}>
        {!popUpActif ? (
          <Text className="text-center text-sm text-slate-400">Aucun lieu attribué pour l&apos;instant — demande à un admin de t&apos;en attribuer un.</Text>
        ) : estVueLocale ? (
          <>
            <Pressable onPress={() => setEcran('pins')} className="mb-2.5 rounded-2xl bg-indigo-500 p-5">
              <Text className="text-lg font-bold text-white">Pin&apos;s</Text>
              <Text className="mt-1 text-xs text-white/80">Stock local, préparation, catalogue</Text>
            </Pressable>
            <Pressable onPress={() => setEcran('commande')} className="rounded-2xl bg-pink-500 p-5">
              <Text className="text-lg font-bold text-white">Voir les commandes</Text>
              <Text className="mt-1 text-xs text-white/80">Pin&apos;s, produits, consommables des pop-ups</Text>
            </Pressable>
          </>
        ) : (
          <>
            <BandeauCommandeEnCours popUpId={popUpActif} profile={profile} />
            <ColonneStock popUpId={popUpActif} onOuvrir={setEcran} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
