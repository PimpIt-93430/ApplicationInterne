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

const COULEURS_VALIDES: CouleurCoqueSac[] = ['Rose', 'Noir'];

function cle(modele: string, couleur: string): string {
  return `${modele}|${couleur}`;
}

/** Le catalogue SumUp ("Coque Iphone + 5 pin's") n'a pas été changé — il garde ses 40 versions au
 * format "Iphone XX · Variante · Couleur" (Normal/Pro/Pro Max/Plus x 13 à 17). Cette table regroupe
 * chaque génération+variante SumUp vers le modèle unique correspondant (cf. retour utilisateur du
 * 2026-09-18 : "quand jachete un iphone 13 ca décrémente iphone 13/14/15") : 13/14/15/Normal ont le
 * même gabarit, 13 Pro/14 Pro pareil, 13 Pro Max/14 Pro Max pareil, 15 Pro et 15 Pro Max changent de
 * gabarit (bords titane) donc restent seuls, 14 Plus rejoint 15 Plus (même gabarit 6,7" hors Pro).
 * "Iphone 13 · Plus" et "Iphone 17 · Plus" n'existent pas chez Apple (SKU du catalogue jamais
 * vendable) et ne sont donc volontairement pas mappés. */
const REGROUPEMENT_SUMUP: Record<string, ModeleCoque> = {
  'iphone 13|normal': '13/14/15',
  'iphone 14|normal': '13/14/15',
  'iphone 15|normal': '13/14/15',
  'iphone 13|pro': '13/14 Pro',
  'iphone 14|pro': '13/14 Pro',
  'iphone 15|pro': '15 Pro',
  'iphone 13|pro max': '13/14 Pro Max',
  'iphone 14|pro max': '13/14 Pro Max',
  'iphone 15|pro max': '15 Pro Max',
  'iphone 14|plus': '15 Plus',
  'iphone 15|plus': '15 Plus',
  'iphone 16|normal': '16',
  'iphone 16|pro': '16 Pro',
  'iphone 16|pro max': '16 Pro Max',
  'iphone 16|plus': '16 Plus',
  'iphone 17|normal': '17',
  'iphone 17|pro': '17 Pro',
  'iphone 17|pro max': '17 Pro Max',
};

/** Parse une description SumUp au format "Iphone XX · Variante · Couleur" et la résout directement
 * vers le modèle regroupé (cf. REGROUPEMENT_SUMUP) — même principe que parserCouleurTaille dans
 * chaussures.ts. Insensible à la casse et aux espaces superflus ; renvoie null si le format, la
 * combinaison génération/variante (SKU inexistant) ou la couleur ne sont pas reconnus. */
function parserModeleCouleur(description: string | null): { modele: ModeleCoque; couleur: CouleurCoqueSac } | null {
  if (!description) return null;
  const parties = description.split('·').map((p) => p.trim());
  if (parties.length !== 3) return null;
  const [generationBrute, varianteBrute, couleurBrute] = parties;
  const modele = REGROUPEMENT_SUMUP[`${generationBrute.toLowerCase()}|${varianteBrute.toLowerCase()}`];
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
