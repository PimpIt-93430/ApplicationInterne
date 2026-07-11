import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, TextInput, View } from 'react-native';

import { statutCase, type CaseGrille } from '@/api/stock';
import { CaseDetailModal } from '@/components/stock/CaseDetailModal';
import { GrilleCases } from '@/components/stock/GrilleCases';
import { EnteteMenu } from '@/components/nav/EnteteMenu';
import { useProfilEffectif } from '@/hooks/useProfilEffectif';
import { useGererCasesPopUp, useGrillePopUp, usePins } from '@/hooks/useStock';
import type { StockPin } from '@/types/database.types';

const COULEURS_STATUT: Record<'partiel' | 'complet', string> = {
  partiel: '#FBBF24',
  complet: '#34D399',
};

function LigneBoiteACompter({ caseGrille, onPress }: { caseGrille: CaseGrille; onPress: () => void }) {
  const statut = statutCase(caseGrille.contenus);
  if (statut === 'vide') return null;

  return (
    <Pressable
      onPress={onPress}
      className="mb-1.5 flex-row items-center justify-between rounded-lg bg-white px-4 py-3"
    >
      <View className="flex-row items-center gap-3">
        <Text className="w-10 text-base font-bold text-slate-800">{caseGrille.casePosition}</Text>
        <Text className="text-sm text-slate-500">
          {caseGrille.contenus.length} pin{caseGrille.contenus.length > 1 ? 's' : ''}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-xs font-semibold text-slate-400">
          {statut === 'complet' ? 'Compté' : 'À compter'}
        </Text>
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: COULEURS_STATUT[statut] }} />
      </View>
    </Pressable>
  );
}

function LignePin({ pin, boites }: { pin: StockPin; boites: string }) {
  return (
    <View className="mb-1.5 flex-row items-center gap-2 rounded-lg bg-white px-2 py-2">
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
      <Text className="w-14 text-center text-xs text-slate-500">{boites || '—'}</Text>
      <Text className="w-12 text-center text-sm font-semibold text-indigo-600">{pin.stock_a_ramener}</Text>
      <Text className="w-14 text-center text-xs text-slate-400">
        {pin.poids_unitaire !== null ? pin.poids_unitaire : '—'}
      </Text>
    </View>
  );
}

export default function StockScreen() {
  const profile = useProfilEffectif();
  const popUpId = profile?.pop_up_id ?? undefined;

  const { data: grille, isLoading: chargementGrille } = useGrillePopUp(popUpId);
  const { data: pins, isLoading: chargementPins } = usePins();
  const { attribuer, peser, estimer } = useGererCasesPopUp(popUpId);

  const [caseOuverte, setCaseOuverte] = useState<{
    position: string;
    contenus: CaseGrille['contenus'];
  } | null>(null);
  const [recherche, setRecherche] = useState('');

  const boitesACompter = useMemo(() => {
    return (grille ?? [])
      .filter((c) => c.contenus.length > 0)
      .sort((a, b) => {
        const statutA = statutCase(a.contenus);
        const statutB = statutCase(b.contenus);
        if (statutA === statutB) return 0;
        return statutA === 'partiel' ? -1 : 1;
      });
  }, [grille]);

  const boitesParPin = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of grille ?? []) {
      for (const contenu of c.contenus) {
        const liste = map.get(contenu.pin.id) ?? [];
        liste.push(c.casePosition);
        map.set(contenu.pin.id, liste);
      }
    }
    return map;
  }, [grille]);

  const pinsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const base = q ? (pins ?? []).filter((p) => p.nom.toLowerCase().includes(q)) : (pins ?? []);
    return base;
  }, [pins, recherche]);

  if (!popUpId) {
    return (
      <View className="flex-1 bg-slate-50">
        <EnteteMenu titre="Stock" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-slate-400">
            Vous n'êtes pas encore rattaché à un pop-up. Demandez à un admin de vous en attribuer un pour
            gérer le stock.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteMenu titre="Stock" />
      <FlatList
        data={pinsAffiches}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <>
            {chargementGrille ? (
              <ActivityIndicator color="#6366F1" />
            ) : (
              <>
                <GrilleCases
                  grille={grille ?? []}
                  onPressCase={(position, contenus) => setCaseOuverte({ position, contenus })}
                />

                <Text className="mb-2 mt-5 text-xs font-semibold uppercase text-slate-400">
                  Choisir une boîte à compter
                </Text>
                {boitesACompter.length === 0 ? (
                  <Text className="mb-2 text-sm text-slate-400">Aucune boîte attribuée pour l'instant.</Text>
                ) : (
                  boitesACompter.map((c) => (
                    <LigneBoiteACompter
                      key={c.casePosition}
                      caseGrille={c}
                      onPress={() => setCaseOuverte({ position: c.casePosition, contenus: c.contenus })}
                    />
                  ))
                )}
              </>
            )}

            <TextInput
              value={recherche}
              onChangeText={setRecherche}
              placeholder={chargementPins ? 'Chargement…' : 'Rechercher un pin…'}
              className="mb-2 mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3"
            />

            <View className="mb-1 flex-row items-center gap-2 px-2">
              <Text className="w-10 text-[10px] font-semibold uppercase text-slate-400" />
              <Text className="flex-1 text-[10px] font-semibold uppercase text-slate-400">Nom</Text>
              <Text className="w-14 text-center text-[10px] font-semibold uppercase text-slate-400">
                Boîtes
              </Text>
              <Text className="w-12 text-center text-[10px] font-semibold uppercase text-slate-400">
                À ramener
              </Text>
              <Text className="w-14 text-center text-[10px] font-semibold uppercase text-slate-400">
                Poids
              </Text>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <LignePin pin={item} boites={(boitesParPin.get(item.id) ?? []).join(', ')} />
        )}
        ListEmptyComponent={
          recherche.trim() ? <Text className="text-sm text-slate-400">Aucun résultat.</Text> : null
        }
      />

      {caseOuverte && (
        <CaseDetailModal
          casePosition={caseOuverte.position}
          contenus={caseOuverte.contenus}
          pins={pins ?? []}
          attribuerEnCours={attribuer.isPending}
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
          onClose={() => setCaseOuverte(null)}
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
    </View>
  );
}
