import type {
  CouleurChaussure,
  LaniereInventaire,
  LaniereMappingSumup,
  LaniereStock,
  TailleChaussure,
  VenteSumupLigne,
} from '@/types/database.types';
import { calculerARamenerGenerique } from '@/utils/inventaireStock';

export interface LaniereAvecARamener extends LaniereStock {
  dernierInventaire: LaniereInventaire | null;
  venduDepuisInventaire: number;
  stockEstime: number | null;
  aRamener: number;
}

export interface VenteLaniere {
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  quantite: number;
  horodatage: string;
}

/** Résout les lignes de vente SumUp vers une couleur/taille via la table de correspondance —
 * contrairement aux chaussures (cf. resoudreVentesSumup), pas de parsing de description ici : les
 * lanières n'ont pas de variante "taille · couleur" connue dans le catalogue SumUp pour l'instant,
 * seul le mapping nom→couleur/taille géré par un admin fait foi. */
export function resoudreVentesSumupLanieres(lignes: VenteSumupLigne[], mapping: LaniereMappingSumup[]): VenteLaniere[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteLaniere[] = [];
  for (const ligne of lignes) {
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({ couleur: m.couleur, taille: m.taille, quantite: ligne.quantite, horodatage: ligne.horodatage });
  }
  return ventes;
}

/** Associe à chaque ligne de stock son dernier inventaire et en déduit ce qu'il faut ramener — cf.
 * calculerARamener (chaussures, même principe). */
export function calculerARamenerLanieres(
  stock: LaniereStock[],
  inventaires: LaniereInventaire[],
  ventes: VenteLaniere[] = [],
): LaniereAvecARamener[] {
  return calculerARamenerGenerique(
    stock,
    inventaires,
    ventes,
    (item) => `${item.couleur}|${item.taille}`,
    (inv) => `${inv.couleur}|${inv.taille}`,
    (vente) => `${vente.couleur}|${vente.taille}`,
  );
}
