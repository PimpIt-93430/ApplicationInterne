import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { usePopUps } from '@/hooks/usePopUps';
import { usePanierProduitsStore } from '@/store/usePanierProduitsStore';
import type { LaniereStock } from '@/types/database.types';

const COULEURS: LaniereStock['couleur'][] = ['Noir', 'Kaki', 'Rose', 'Gris'];
const TAILLES: LaniereStock['taille'][] = ['36-37', '38-39', '40-41', '41-42', '43-44', '45-46'];

/** Même composant que SacsScreen (CelluleAjout) — pas de comptage/inventaire ici (retour
 * utilisateur du 2026-09-18 : "c'est pas un inventaire qui se décrémente"), juste une demande
 * ponctuelle ajoutée au panier de la commande générale (cf. usePanierProduitsStore,
 * CommandeGeneraleEcran). */
function CelluleAjout({ label, enAttente, onAjouter }: { label: string; enAttente: number; onAjouter: (quantite: number) => void }) {
  const [valeur, setValeur] = useState('1');
  return (
    <View className="items-center">
      <Text className="mb-1 text-[11px] font-semibold text-slate-400">{label}</Text>
      <TextInput
        value={valeur}
        onChangeText={setValeur}
        keyboardType="number-pad"
        placeholder="1"
        className="mb-1.5 h-9 w-14 rounded-lg border border-slate-200 bg-white text-center text-sm font-semibold text-slate-700"
      />
      <Pressable
        onPress={() => {
          const n = Number(valeur) || 0;
          if (n <= 0) return;
          onAjouter(n);
          setValeur('1');
        }}
        className="rounded-lg bg-indigo-600 px-2.5 py-1.5"
      >
        <Text className="text-xs font-bold text-white">Ajouter</Text>
      </Pressable>
      {enAttente > 0 && <Text className="mt-1 text-[10px] font-semibold text-emerald-600">{enAttente} en attente</Text>}
    </View>
  );
}

export function LanieresScreen({ onRetour, popUpId }: { onRetour: () => void; popUpId: string | undefined }) {
  const { data: popUps } = usePopUps();
  const lignesPanier = usePanierProduitsStore((s) => s.lignes);
  const ajouterPanier = usePanierProduitsStore((s) => s.ajouter);
  const lignesLanieres = useMemo(() => lignesPanier.filter((l) => l.categorie === 'lanieres'), [lignesPanier]);

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Lanières" onRetour={onRetour} />

      <Text className="px-4 pt-2 text-sm font-semibold text-slate-500">
        {popUps?.find((p) => p.id === popUpId)?.nom ?? '—'}
      </Text>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="mb-3 text-xs text-slate-400">
          Pas de suivi de stock ici — ajoute juste ce qu&apos;il te faut à la commande, ça part avec
          le reste depuis &quot;Voir la commande&quot;.
        </Text>
        {COULEURS.map((couleur) => (
          <View key={couleur} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="mb-3 text-base font-bold text-slate-900">{couleur}</Text>
            <View className="flex-row flex-wrap gap-3">
              {TAILLES.map((taille) => {
                const libelle = `${couleur} — ${taille}`;
                const enAttente = lignesLanieres.find((l) => l.libelle === libelle)?.quantite ?? 0;
                return (
                  <CelluleAjout
                    key={taille}
                    label={taille}
                    enAttente={enAttente}
                    onAjouter={(q) => ajouterPanier('lanieres', libelle, q)}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
