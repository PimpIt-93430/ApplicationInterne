import { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { ChaussuresScreen } from '@/components/stock/ChaussuresScreen';
import { ConsommablesScreen } from '@/components/stock/ConsommablesScreen';
import { CoquesScreen } from '@/components/stock/CoquesScreen';
import { EcranBientotDisponible } from '@/components/stock/EcranBientotDisponible';
import { ProduitsMenu } from '@/components/stock/ProduitsMenu';
import { SacsScreen } from '@/components/stock/SacsScreen';
import { StockScreen } from '@/components/stock/StockScreen';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { Dropdown } from '@/components/ui/Dropdown';
import { usePopUps } from '@/hooks/usePopUps';
import { useAffectationsPopUp } from '@/hooks/useProfiles';
import type { Profile } from '@/types/database.types';
import { construireMapAffectations, popUpsAttribues } from '@/utils/affectations';

type Categorie = 'menu' | 'pins' | 'produits' | 'chaussures' | 'coques' | 'sac' | 'goodies' | 'consommables';

/** Sur ordinateur, une tuile pleine largeur qui remplit tout l'écran est démesurée (elle n'a de
 * sens que sur un écran de téléphone étroit) : carte compacte à taille fixe à la place, en ligne
 * plutôt qu'empilées. */
function TuileCategorie({
  label,
  sousTitre,
  couleur,
  onPress,
}: {
  label: string;
  sousTitre: string;
  couleur: string;
  onPress: () => void;
}) {
  if (Platform.OS === 'web') {
    return (
      <Pressable
        onPress={onPress}
        style={{ backgroundColor: couleur }}
        className="w-[220px] rounded-2xl p-5 shadow-md"
      >
        <Text className="text-lg font-bold text-white">{label}</Text>
        <Text className="mt-1 text-xs text-white/80">{sousTitre}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: couleur }}
      className="flex-1 items-center justify-center rounded-3xl"
    >
      <Text className="text-xl font-bold text-white">{label}</Text>
    </Pressable>
  );
}

/** Point d'entrée de Stock : trois catégories (Pin's / Chaussures / Consommables), chacune avec
 * son propre écran. Le choix du pop-up se fait une seule fois ici en arrivant et reste le même en
 * changeant de catégorie (`popUpId`/`onChangePopUpId` passés en props contrôlées à StockScreen/
 * ConsommablesScreen). Un admin choisit toujours parmi tous les lieux ; un non-admin n'a le choix
 * que s'il est attribué à plusieurs pop-up (ex. Makeda, Créteil Soleil + Oparinord), sinon son
 * unique lieu s'affiche sans sélecteur. */
export function StockAccueil({ profile }: { profile: Profile }) {
  const [categorie, setCategorie] = useState<Categorie>('menu');
  const estAdmin = profile.role === 'admin';

  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const mesPopUps = estAdmin ? (popUpsTous ?? []) : popUpsAttribues(profile, mapAffectations, popUpsTous ?? []);
  const plusieursPopUps = estAdmin || mesPopUps.length > 1;

  // Choix du lieu — fait une seule fois ici en arrivant sur Stock, puis reste le même en passant de
  // "Pin's" à "Consommables" (cf. StockScreen/ConsommablesScreen, désormais contrôlés par ce state
  // plutôt que d'avoir chacun le leur).
  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  const popUpActif = popUpId ?? mesPopUps[0]?.id;
  const monPopUp = mesPopUps.find((p) => p.id === popUpActif);

  if (categorie === 'pins') {
    return (
      <StockScreen
        profile={profile}
        onRetour={() => setCategorie('menu')}
        popUpId={popUpActif}
        onChangePopUpId={setPopUpId}
      />
    );
  }
  if (categorie === 'produits') {
    return <ProduitsMenu onOuvrirSousCategorie={setCategorie} onRetour={() => setCategorie('menu')} />;
  }
  if (categorie === 'chaussures') {
    return <ChaussuresScreen onRetour={() => setCategorie('produits')} popUpId={popUpActif} />;
  }
  if (categorie === 'coques') {
    return <CoquesScreen onRetour={() => setCategorie('produits')} popUpId={popUpActif} />;
  }
  if (categorie === 'sac') {
    return <SacsScreen onRetour={() => setCategorie('produits')} popUpId={popUpActif} />;
  }
  if (categorie === 'goodies') {
    return <EcranBientotDisponible titre="Goodies" onRetour={() => setCategorie('produits')} />;
  }
  if (categorie === 'consommables') {
    return (
      <ConsommablesScreen
        onRetour={() => setCategorie('menu')}
        popUpId={popUpActif}
        onChangePopUpId={setPopUpId}
      />
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      {plusieursPopUps ? (
        <>
          <EnteteMenu titre="Stock" />
          <View className="px-4 pb-2">
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Pop-up
            </Text>
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
      <View className={Platform.OS === 'web' ? 'flex-row flex-wrap gap-4 p-6' : 'flex-1 gap-4 p-4'}>
        <TuileCategorie
          label="Pin's"
          sousTitre="Catalogue, boîtes, commandes"
          couleur="#6366F1"
          onPress={() => setCategorie('pins')}
        />
        <TuileCategorie
          label="Produits"
          sousTitre="Chaussures, coques, sac, goodies"
          couleur="#F59E0B"
          onPress={() => setCategorie('produits')}
        />
        <TuileCategorie
          label="Consommables"
          sousTitre="Suivi du stock"
          couleur="#10B981"
          onPress={() => setCategorie('consommables')}
        />
      </View>
    </View>
  );
}
