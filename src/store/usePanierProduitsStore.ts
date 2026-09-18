import { create } from 'zustand';

import { uuidV4 } from '@/utils/uuid';

/** Retour utilisateur du 2026-09-18 : sacs et lanières n'ont plus de suivi de stock/inventaire —
 * juste un bouton "Ajouter à la commande" quand le pop-up en veut. Panier en mémoire (pas persisté
 * en base tant que rien n'est envoyé, même principe que useCommandeQuantitesStore pour les pin's),
 * fusionné dans "Voir la commande" (CommandeGeneraleEcran) avec les lignes chaussures/coques
 * calculées automatiquement, puis envoyé en une fois avec le reste. */
export type CategoriePanier = 'sacs' | 'lanieres';

export interface LignePanierProduit {
  produitId: string;
  categorie: CategoriePanier;
  libelle: string;
  quantite: number;
}

interface PanierProduitsState {
  lignes: LignePanierProduit[];
  ajouter: (categorie: CategoriePanier, libelle: string, quantite: number) => void;
  retirer: (produitId: string) => void;
  reinitialiser: (categorie: CategoriePanier) => void;
}

export const usePanierProduitsStore = create<PanierProduitsState>((set) => ({
  lignes: [],
  ajouter: (categorie, libelle, quantite) =>
    set((s) => {
      const existante = s.lignes.find((l) => l.categorie === categorie && l.libelle === libelle);
      if (existante) {
        return { lignes: s.lignes.map((l) => (l === existante ? { ...l, quantite: l.quantite + quantite } : l)) };
      }
      return { lignes: [...s.lignes, { produitId: uuidV4(), categorie, libelle, quantite }] };
    }),
  retirer: (produitId) => set((s) => ({ lignes: s.lignes.filter((l) => l.produitId !== produitId) })),
  reinitialiser: (categorie) => set((s) => ({ lignes: s.lignes.filter((l) => l.categorie !== categorie) })),
}));
