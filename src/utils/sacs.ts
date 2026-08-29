import type {
  CouleurCoqueSac,
  ProduitSac,
  SacInventaire,
  SacMappingSumup,
  SacStock,
  VenteSumupLigne,
} from '@/types/database.types';
import { calculerARamenerGenerique } from '@/utils/inventaireStock';

export interface SacAvecARamener extends SacStock {
  dernierInventaire: SacInventaire | null;
  venduDepuisInventaire: number;
  stockEstime: number | null;
  aRamener: number;
}

export interface VenteSac {
  produit: ProduitSac;
  couleur: CouleurCoqueSac;
  quantite: number;
  horodatage: string;
}

const PRODUITS_VALIDES: ProduitSac[] = ['Grandes Pochettes', 'Petites Pochettes', "Sac Pimp-it + 6 pin's"];
const COULEURS_VALIDES: CouleurCoqueSac[] = ['Rose', 'Noir'];

function cle(produit: string, couleur: string): string {
  return `${produit}|${couleur}`;
}

/** Contrairement aux chaussures/coques, la description SumUp d'un sac ne porte qu'une seule valeur
 * (la couleur, ex. "Noir  ") — pas de "taille"/"variante" à côté, donc pas de format à parties
 * multiples à découper ici. */
function parserCouleur(description: string | null): CouleurCoqueSac | null {
  if (!description) return null;
  const brut = description.trim();
  return COULEURS_VALIDES.find((c) => c.toLowerCase() === brut.toLowerCase()) ?? null;
}

/** Le nom du produit SumUp identifie directement lequel des 3 sacs/pochettes il s'agit — trim
 * seulement (les ventes réelles montrent des noms avec espaces superflus, ex. "Grandes Pochettes  "),
 * pas de correspondance approximative au-delà de ça. */
function resoudreProduit(nomProduit: string): ProduitSac | null {
  const brut = nomProduit.trim();
  return PRODUITS_VALIDES.find((p) => p === brut) ?? null;
}

/** Résout les lignes de vente SumUp brutes vers un produit/couleur — priorité au nom de produit +
 * description (couleur), retombe sur la table de correspondance gérée par un admin sinon. Même
 * principe que resoudreVentesSumup (chaussures.ts), adapté : ici c'est le nom du produit qui porte
 * l'essentiel de l'info (lequel des 3 sacs), la description ne portant que la couleur. */
export function resoudreVentesSumupSacs(lignes: VenteSumupLigne[], mapping: SacMappingSumup[]): VenteSac[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteSac[] = [];
  for (const ligne of lignes) {
    const produit = resoudreProduit(ligne.nom_produit);
    const couleur = parserCouleur(ligne.description);
    if (produit && couleur) {
      ventes.push({ produit, couleur, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({ produit: m.produit, couleur: m.couleur, quantite: ligne.quantite, horodatage: ligne.horodatage });
  }
  return ventes;
}

/** Associe à chaque ligne de stock son dernier inventaire et en déduit ce qu'il faut ramener — même
 * principe que calculerARamener (chaussures.ts), cf. calculerARamenerGenerique. */
export function calculerARamenerSacs(
  stock: SacStock[],
  inventaires: SacInventaire[],
  ventes: VenteSac[] = [],
): SacAvecARamener[] {
  return calculerARamenerGenerique(
    stock,
    inventaires,
    ventes,
    (item) => cle(item.produit, item.couleur),
    (inv) => cle(inv.produit, inv.couleur),
    (vente) => cle(vente.produit, vente.couleur),
  );
}
