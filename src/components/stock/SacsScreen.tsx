import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { EnteteRetour } from '@/components/nav/EnteteRetour';
import { usePopUps } from '@/hooks/usePopUps';
import { usePanierProduitsStore } from '@/store/usePanierProduitsStore';
import type { CouleurCoqueSac, ProduitSac } from '@/types/database.types';

const PRODUITS: ProduitSac[] = ['Grandes Pochettes', 'Petites Pochettes', "Sac Pimp-it + 6 pin's"];
const COULEURS: CouleurCoqueSac[] = ['Rose', 'Noir'];

/** Une case "quantité + Ajouter" — pas de comptage/inventaire ici (retour utilisateur du
 * 2026-09-18 : "c'est pas un inventaire qui se décrémente"), juste une demande ponctuelle ajoutée
 * au panier de la commande générale (cf. usePanierProduitsStore, CommandeGeneraleEcran). */
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

export function SacsScreen({
  onRetour,
  popUpId,
}: {
  onRetour: () => void;
  // Contrôlé par StockAccueil (même sélecteur partagé qu'avec Chaussures/Pin's/Consommables) —
  // gardé dans la signature même si non utilisé pour le calcul ici, juste pour afficher le nom du
  // pop-up et garder la même forme d'appel que les autres écrans de catégorie.
  popUpId: string | undefined;
}) {
  const { data: popUps } = usePopUps();
  const lignesPanier = usePanierProduitsStore((s) => s.lignes);
  const ajouterPanier = usePanierProduitsStore((s) => s.ajouter);
  const lignesSacs = useMemo(() => lignesPanier.filter((l) => l.categorie === 'sacs'), [lignesPanier]);

  return (
    <View className="flex-1 bg-slate-50">
      <EnteteRetour titre="Sacs & pochettes" onRetour={onRetour} />

      <Text className="px-4 pt-2 text-sm font-semibold text-slate-500">
        {popUps?.find((p) => p.id === popUpId)?.nom ?? '—'}
      </Text>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="mb-3 text-xs text-slate-400">
          Pas de suivi de stock ici — ajoute juste ce qu&apos;il te faut à la commande, ça part avec
          le reste depuis &quot;Voir la commande&quot;.
        </Text>
        {PRODUITS.map((produit) => (
          <View key={produit} className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="mb-3 text-base font-bold text-slate-900">{produit}</Text>
            <View className="flex-row flex-wrap gap-3">
              {COULEURS.map((couleur) => {
                const libelle = `${produit} — ${couleur}`;
                const enAttente = lignesSacs.find((l) => l.libelle === libelle)?.quantite ?? 0;
                return (
                  <CelluleAjout
                    key={couleur}
                    label={couleur}
                    enAttente={enAttente}
                    onAjouter={(q) => ajouterPanier('sacs', libelle, q)}
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
