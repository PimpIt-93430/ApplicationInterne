import { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { ChaussuresScreen } from '@/components/stock/ChaussuresScreen';
import { ConsommablesScreen } from '@/components/stock/ConsommablesScreen';
import { EcranBientotDisponible } from '@/components/stock/EcranBientotDisponible';
import { ProduitsMenu } from '@/components/stock/ProduitsMenu';
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
 * son propre écran. Pour un admin (plusieurs lieux), le choix du pop-up se fait une seule fois ici
 * en arrivant et reste le même en changeant de catégorie (`popUpId`/`onChangePopUpId` passés en
 * props contrôlées à StockScreen/ConsommablesScreen) ; un non-admin n'a qu'un lieu, pas de choix. */
export function StockAccueil({ profile }: { profile: Profile }) {
  const [categorie, setCategorie] = useState<Categorie>('menu');
  const estAdmin = profile.role === 'admin';

  const { data: popUpsTous } = usePopUps();
  const { data: affectations } = useAffectationsPopUp();
  const mapAffectations = useMemo(() => construireMapAffectations(affectations ?? []), [affectations]);
  const monPopUp = estAdmin ? null : popUpsAttribues(profile, mapAffectations, popUpsTous ?? [])[0];

  // Choix du lieu pour un admin (qui en a plusieurs) — fait une seule fois ici en arrivant sur
  // Stock, puis reste le même en passant de "Pin's" à "Consommables" (cf. StockScreen/
  // ConsommablesScreen, désormais contrôlés par ce state plutôt que d'avoir chacun le leur).
  const [popUpId, setPopUpId] = useState<string | undefined>(undefined);
  const popUpActif = estAdmin ? (popUpId ?? popUpsTous?.[0]?.id) : monPopUp?.id;

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
    return <ChaussuresScreen onRetour={() => setCategorie('produits')} />;
  }
  if (categorie === 'coques' || categorie === 'sac' || categorie === 'goodies') {
    const titres = { coques: 'Coques', sac: 'Sac', goodies: 'Goodies' } as const;
    return <EcranBientotDisponible titre={titres[categorie]} onRetour={() => setCategorie('produits')} />;
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
      {estAdmin ? (
        <>
          <EnteteMenu titre="Stock" />
          <View className="px-4 pb-2">
            <Text className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Pop-up
            </Text>
            <Dropdown
              value={popUpActif}
              options={(popUpsTous ?? []).map((p) => ({ value: p.id, label: p.nom, couleur: p.couleur }))}
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
