import type {
  CoqueInventaire,
  CoqueMappingSumup,
  CoqueStock,
  CouleurCoqueSac,
  ModeleCoque,
  VarianteCoque,
  VenteSumupLigne,
} from '@/types/database.types';
import { calculerARamenerGenerique } from '@/utils/inventaireStock';

export interface CoqueAvecARamener extends CoqueStock {
  dernierInventaire: CoqueInventaire | null;
  venduDepuisInventaire: number;
  stockEstime: number | null;
  aRamener: number;
}

export interface VenteCoque {
  modele: ModeleCoque;
  variante: VarianteCoque;
  couleur: CouleurCoqueSac;
  quantite: number;
  horodatage: string;
}

const MODELES_VALIDES: ModeleCoque[] = ['Iphone 13', 'Iphone 14', 'Iphone 15', 'Iphone 16', 'Iphone 17'];
const VARIANTES_VALIDES: VarianteCoque[] = ['Normal', 'Pro', 'Pro Max', 'Plus'];
const COULEURS_VALIDES: CouleurCoqueSac[] = ['Rose', 'Noir'];

function cle(modele: string, variante: string, couleur: string): string {
  return `${modele}|${variante}|${couleur}`;
}

/** Parse une description SumUp au format "modèle · variante · couleur" (ex. "Iphone 13  · Pro  ·
 * Rose  ", constaté sur le catalogue "Coque Iphone + 5 pin's") — même principe que
 * parserCouleurTaille dans chaussures.ts. Insensible à la casse et aux espaces superflus ; renvoie
 * null si le format ou les valeurs ne correspondent pas à nos modèles/variantes/couleurs connus. */
function parserModeleVarianteCouleur(
  description: string | null,
): { modele: ModeleCoque; variante: VarianteCoque; couleur: CouleurCoqueSac } | null {
  if (!description) return null;
  const parties = description.split('·').map((p) => p.trim());
  if (parties.length !== 3) return null;
  const [modeleBrut, varianteBrute, couleurBrute] = parties;
  const modele = MODELES_VALIDES.find((m) => m.toLowerCase() === modeleBrut.toLowerCase());
  const variante = VARIANTES_VALIDES.find((v) => v.toLowerCase() === varianteBrute.toLowerCase());
  const couleur = COULEURS_VALIDES.find((c) => c.toLowerCase() === couleurBrute.toLowerCase());
  if (!modele || !variante || !couleur) return null;
  return { modele, variante, couleur };
}

/** Résout les lignes de vente SumUp brutes vers un modèle/variante/couleur — priorité au parsing de
 * la description, retombe sur la table de correspondance nom→modèle/variante/couleur gérée par un
 * admin quand la description ne parse pas. Même principe que resoudreVentesSumup (chaussures.ts). */
export function resoudreVentesSumupCoques(
  lignes: VenteSumupLigne[],
  mapping: CoqueMappingSumup[],
): VenteCoque[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteCoque[] = [];
  for (const ligne of lignes) {
    const parsed = parserModeleVarianteCouleur(ligne.description);
    if (parsed) {
      ventes.push({ ...parsed, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({
      modele: m.modele,
      variante: m.variante,
      couleur: m.couleur,
      quantite: ligne.quantite,
      horodatage: ligne.horodatage,
    });
  }
  return ventes;
}

/** Associe à chaque ligne de stock son dernier inventaire et en déduit ce qu'il faut ramener — même
 * principe que calculerARamener (chaussures.ts), cf. calculerARamenerGenerique. */
export function calculerARamenerCoques(
  stock: CoqueStock[],
  inventaires: CoqueInventaire[],
  ventes: VenteCoque[] = [],
): CoqueAvecARamener[] {
  return calculerARamenerGenerique(
    stock,
    inventaires,
    ventes,
    (item) => cle(item.modele, item.variante, item.couleur),
    (inv) => cle(inv.modele, inv.variante, inv.couleur),
    (vente) => cle(vente.modele, vente.variante, vente.couleur),
  );
}
