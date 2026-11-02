import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { LABEL_CATEGORIE_PRODUIT, useCatalogueProduits, type GroupeProduit } from '@/hooks/useCatalogueProduits';
import { usePopUps } from '@/hooks/usePopUps';
import { useGererSaisiesCommande, useSaisiesCommande } from '@/hooks/useSaisiesCommande';
import type { CategorieProduit, Profile } from '@/types/database.types';

/** Une case quantité — vide = 0 (rien à commander pour cette variante). */
function CelluleQuantite({ label, valeur, onChange }: { label: string; valeur: string; onChange: (texte: string) => void }) {
  const remplie = (Number(valeur) || 0) > 0;
  return (
    <View className="items-center">
      <Text className="mb-1 text-[11px] font-semibold text-slate-400">{label}</Text>
      <TextInput
        value={valeur}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="0"
        className={`h-11 w-14 rounded-lg border text-center text-sm font-semibold ${
          remplie ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'
        }`}
      />
    </View>
  );
}

/** Saisie de la quantité à commander pour une catégorie de produits (chaussures, coques, sacs,
 * lanières) — retour utilisateur du 2026-10-23 : "ce sont eux qui rentrent", plus aucune logique
 * qui décrémente à chaque vente SumUp. "Valider" enregistre la saisie (stock_saisies_commande) et
 * fait passer la case au vert dans la colonne Stock, même si tout est à 0. */
export function SaisieProduitsScreen({
  categorie,
  popUpId,
  profile,
  onRetour,
}: {
  categorie: CategorieProduit;
  popUpId: string | undefined;
  profile: Profile;
  onRetour: () => void;
}) {
  const { data: popUps } = usePopUps();
  const { groupes, chargement: chargementCatalogue } = useCatalogueProduits();
  const { data: saisies, isLoading: chargementSaisies } = useSaisiesCommande(popUpId);

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre={LABEL_CATEGORIE_PRODUIT[categorie]} onRetour={onRetour} />
      <Text className="px-4 pt-2 text-sm font-semibold text-slate-500">{popUps?.find((p) => p.id === popUpId)?.nom ?? '—'}</Text>

      {chargementCatalogue || chargementSaisies ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      ) : (
        <FormulaireQuantites
          categorie={categorie}
          popUpId={popUpId}
          profile={profile}
          groupesCategorie={groupes[categorie]}
          quantitesInitiales={saisies?.find((s) => s.categorie === categorie)?.quantites ?? {}}
          dejaValidee={!!saisies?.some((s) => s.categorie === categorie)}
          onValide={onRetour}
        />
      )}
    </View>
  );
}

/** Monté une fois les données chargées : reprend la saisie déjà validée (par soi ou un collègue)
 * comme état initial, pour pouvoir la corriger sans tout retaper — sans écraser ensuite ce qui est
 * en cours de frappe si un collègue valide entre-temps. */
function FormulaireQuantites({
  categorie,
  popUpId,
  profile,
  groupesCategorie,
  quantitesInitiales,
  dejaValidee,
  onValide,
}: {
  categorie: CategorieProduit;
  popUpId: string | undefined;
  profile: Profile;
  groupesCategorie: GroupeProduit[];
  quantitesInitiales: Record<string, number>;
  dejaValidee: boolean;
  onValide: () => void;
}) {
  const { valider, supprimer } = useGererSaisiesCommande(popUpId);
  const [quantites, setQuantites] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(quantitesInitiales).map(([id, q]) => [id, String(q)])),
  );

  const total = Object.values(quantites).reduce((s, q) => s + (Number(q) || 0), 0);

  const enregistrer = () => {
    if (!popUpId) return;
    valider.mutate(
      {
        categorie,
        quantites: Object.fromEntries(Object.entries(quantites).map(([id, q]) => [id, Number(q) || 0])),
        profileId: profile.id,
      },
      {
        onSuccess: onValide,
        onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : "Impossible d'enregistrer."),
      },
    );
  };

  return (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 960, width: '100%', alignSelf: 'center' }}>
          <Text className="mb-3 text-xs text-slate-400">
            Tape la quantité à commander pour chaque modèle (laisse vide si tu n&apos;en veux pas), puis valide.
            Même si tu n&apos;as besoin de rien, valide pour passer la case au vert.
          </Text>

          {groupesCategorie.map((groupe) => (
            <View key={groupe.titre} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="mb-3 text-base font-bold text-slate-900">{groupe.titre}</Text>
              <View className="flex-row flex-wrap gap-3">
                {groupe.variantes.map((v) => (
                  <CelluleQuantite
                    key={v.id}
                    label={v.label}
                    valeur={quantites[v.id] ?? ''}
                    onChange={(texte) => setQuantites((prev) => ({ ...prev, [v.id]: texte }))}
                  />
                ))}
              </View>
            </View>
          ))}

          <Pressable
            onPress={enregistrer}
            disabled={valider.isPending || !popUpId}
            className="mt-2 items-center rounded-xl bg-emerald-500 py-3.5"
          >
            <Text className="text-base font-bold text-white">
              {valider.isPending
                ? 'Enregistrement…'
                : total > 0
                  ? `Valider (${total} article${total > 1 ? 's' : ''})`
                  : 'Valider — rien à commander'}
            </Text>
          </Pressable>

          {/* Retour utilisateur du 2026-10-26 : pouvoir remettre la case "à faire" après coup. */}
          {dejaValidee && (
            <Pressable
              onPress={() =>
                supprimer.mutate([categorie], {
                  onSuccess: onValide,
                  onError: (e) => Alert.alert('Erreur', e instanceof Error ? e.message : 'Impossible de dévalider.'),
                })
              }
              disabled={supprimer.isPending}
              className="mt-2 items-center rounded-xl border border-slate-300 bg-white py-3"
            >
              <Text className="text-sm font-semibold text-slate-600">{supprimer.isPending ? 'Annulation…' : 'Dévalider'}</Text>
            </Pressable>
          )}
        </ScrollView>
  );
}
