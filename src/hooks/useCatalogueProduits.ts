import { useMemo } from 'react';

import { useChaussuresStock } from '@/hooks/useChaussures';
import { useCoquesStock } from '@/hooks/useCoques';
import { useLanieresStock } from '@/hooks/useLanieres';
import { useSacsStock } from '@/hooks/useSacs';
import type { CategorieProduit, ModeleCoque } from '@/types/database.types';

export interface VarianteProduit {
  /** id de la ligne dans chaussures_stock/coques_stock/sacs_stock/lanieres_stock — clé des
   * quantités saisies (stock_saisies_commande.quantites) et produit_id de la ligne de commande. */
  id: string;
  /** Libellé court dans la case de saisie (ex. "40-41"). */
  label: string;
  /** Libellé complet repris dans la commande envoyée au local (ex. "Noir — 40-41"). */
  libelleCommande: string;
}

export interface GroupeProduit {
  titre: string;
  variantes: VarianteProduit[];
}

export const LABEL_CATEGORIE_PRODUIT: Record<CategorieProduit, string> = {
  chaussures: 'Chaussures',
  coques: 'Coques',
  sacs: 'Sacs & pochettes',
  lanieres: 'Lanières',
};

const COULEURS_CHAUSSURES = ['Noir', 'Kaki', 'Rose', 'Gris'];
const PRODUITS_SACS = ['Grandes Pochettes', 'Petites Pochettes', "Sac Pimp-it + 6 pin's"];
const MODELES_COQUES: ModeleCoque[] = [
  '13/14/15',
  '13/14 Pro',
  '13/14 Pro Max',
  '15 Pro',
  '15 Pro Max',
  '15 Plus',
  '16',
  '16 Pro',
  '16 Pro Max',
  '16 Plus',
  '17',
  '17 Pro',
  '17 Pro Max',
];

function grouper<T>(
  items: T[],
  ordreGroupes: string[],
  groupe: (item: T) => string,
  variante: (item: T) => VarianteProduit,
  titreGroupe: (g: string) => string = (g) => g,
): GroupeProduit[] {
  return ordreGroupes
    .map((g) => ({ titre: titreGroupe(g), variantes: items.filter((i) => groupe(i) === g).map(variante) }))
    .filter((g) => g.variantes.length > 0);
}

/** Les variantes commandables de chaque catégorie de produits, regroupées comme à l'écran (couleur
 * pour chaussures/lanières, modèle pour les coques, produit pour les sacs). Les listes viennent des
 * tables *_stock existantes (gérées dans le Hub), seules leurs lignes servent ici — plus aucun
 * stock visé ni inventaire. */
export function useCatalogueProduits(): { groupes: Record<CategorieProduit, GroupeProduit[]>; chargement: boolean } {
  const { data: chaussures, isLoading: c1 } = useChaussuresStock();
  const { data: coques, isLoading: c2 } = useCoquesStock();
  const { data: sacs, isLoading: c3 } = useSacsStock();
  const { data: lanieres, isLoading: c4 } = useLanieresStock();

  const groupes = useMemo(
    () => ({
      chaussures: grouper(
        chaussures ?? [],
        COULEURS_CHAUSSURES,
        (i) => i.couleur,
        (i) => ({ id: i.id, label: i.taille, libelleCommande: `${i.couleur} — ${i.taille}` }),
      ),
      coques: grouper(
        coques ?? [],
        MODELES_COQUES,
        (i) => i.modele,
        (i) => ({ id: i.id, label: i.couleur, libelleCommande: `Iphone ${i.modele} — ${i.couleur}` }),
        (g) => `Iphone ${g}`,
      ),
      sacs: grouper(
        sacs ?? [],
        PRODUITS_SACS,
        (i) => i.produit,
        (i) => ({ id: i.id, label: i.couleur, libelleCommande: `${i.produit} — ${i.couleur}` }),
      ),
      lanieres: grouper(
        lanieres ?? [],
        COULEURS_CHAUSSURES,
        (i) => i.couleur,
        (i) => ({ id: i.id, label: i.taille, libelleCommande: `Lanière ${i.couleur} — ${i.taille}` }),
      ),
    }),
    [chaussures, coques, sacs, lanieres],
  );

  return { groupes, chargement: c1 || c2 || c3 || c4 };
}
