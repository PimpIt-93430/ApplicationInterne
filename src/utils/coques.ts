import type {
  CoqueInventaire,
  CoqueMappingSumup,
  CoqueStock,
  CouleurCoqueSac,
  ModeleCoque,
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
  couleur: CouleurCoqueSac;
  quantite: number;
  horodatage: string;
}

const MODELES_VALIDES: ModeleCoque[] = [
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
const COULEURS_VALIDES: CouleurCoqueSac[] = ['Rose', 'Noir'];

function cle(modele: string, couleur: string): string {
  return `${modele}|${couleur}`;
}

/** Parse une description SumUp au format "modèle · couleur" (ex. "16 Pro Max · Noir") — même
 * principe que parserCouleurTaille dans chaussures.ts. Insensible à la casse et aux espaces
 * superflus ; renvoie null si le format ou les valeurs ne correspondent pas à nos modèles/couleurs
 * connus. */
function parserModeleCouleur(description: string | null): { modele: ModeleCoque; couleur: CouleurCoqueSac } | null {
  if (!description) return null;
  const parties = description.split('·').map((p) => p.trim());
  if (parties.length !== 2) return null;
  const [modeleBrut, couleurBrute] = parties;
  const modele = MODELES_VALIDES.find((m) => m.toLowerCase() === modeleBrut.toLowerCase());
  const couleur = COULEURS_VALIDES.find((c) => c.toLowerCase() === couleurBrute.toLowerCase());
  if (!modele || !couleur) return null;
  return { modele, couleur };
}

/** Résout les lignes de vente SumUp brutes vers un modèle/couleur — priorité au parsing de la
 * description, retombe sur la table de correspondance nom→modèle/couleur gérée par un admin quand
 * la description ne parse pas. Même principe que resoudreVentesSumup (chaussures.ts). */
export function resoudreVentesSumupCoques(
  lignes: VenteSumupLigne[],
  mapping: CoqueMappingSumup[],
): VenteCoque[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteCoque[] = [];
  for (const ligne of lignes) {
    const parsed = parserModeleCouleur(ligne.description);
    if (parsed) {
      ventes.push({ ...parsed, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({
      modele: m.modele,
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
    (item) => cle(item.modele, item.couleur),
    (inv) => cle(inv.modele, inv.couleur),
    (vente) => cle(vente.modele, vente.couleur),
  );
}
