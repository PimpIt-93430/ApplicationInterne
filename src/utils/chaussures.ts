import type {
  ChaussureInventaire,
  ChaussureMappingSumup,
  ChaussureStock,
  CouleurChaussure,
  TailleChaussure,
  VenteSumupLigne,
} from '@/types/database.types';

export interface ChaussureAvecARamener extends ChaussureStock {
  dernierInventaire: ChaussureInventaire | null;
  /** Ventes SumUp mappées à cette couleur/taille survenues depuis le dernier inventaire — 0 tant
   * qu'aucun inventaire n'a été fait (rien à quoi comparer un horodatage). */
  venduDepuisInventaire: number;
  /** stock_initial - (dernier inventaire compté - ventes depuis ce comptage), jamais négatif. 0
   * tant qu'aucun inventaire n'a été fait pour cette couleur/taille (on ne peut pas savoir ce qui
   * manque sans avoir compté). */
  aRamener: number;
}

export interface VenteChaussure {
  couleur: CouleurChaussure;
  taille: TailleChaussure;
  quantite: number;
  horodatage: string;
}

const COULEURS_VALIDES: CouleurChaussure[] = ['Noir', 'Kaki', 'Rose', 'Gris'];
const TAILLES_VALIDES: TailleChaussure[] = ['36-37', '38-39', '40-41', '41-42', '43-44', '45-46'];

/** Parse une description de ligne SumUp au format "taille · couleur" (ex. "43-44 · Noir", constaté
 * sur le catalogue "Clogs" — la variante choisie à la vente est là, pas dans le nom du produit qui
 * reste générique). Insensible à la casse et aux espaces superflus ; renvoie null si le format ou
 * les valeurs ne correspondent pas à nos couleurs/tailles connues. */
function parserCouleurTaille(description: string | null): { couleur: CouleurChaussure; taille: TailleChaussure } | null {
  if (!description) return null;
  const parties = description.split('·').map((p) => p.trim());
  if (parties.length !== 2) return null;
  const [tailleBrute, couleurBrute] = parties;
  const taille = TAILLES_VALIDES.find((t) => t === tailleBrute);
  const couleur = COULEURS_VALIDES.find((c) => c.toLowerCase() === couleurBrute.toLowerCase());
  if (!taille || !couleur) return null;
  return { couleur, taille };
}

/** Résout les lignes de vente SumUp brutes vers une couleur/taille — priorité au parsing de la
 * description (ex. "43-44 · Noir", cf. parserCouleurTaille), qui reflète la variante réellement
 * choisie à la vente ; retombe sur la table de correspondance nom→couleur/taille gérée par un
 * admin seulement quand la description ne parse pas (absente, autre format...). Une ligne qui ne
 * résout ni par l'un ni par l'autre est ignorée (pas de couleur/taille à lui donner). */
export function resoudreVentesSumup(
  lignes: VenteSumupLigne[],
  mapping: ChaussureMappingSumup[],
): VenteChaussure[] {
  const mappingParNom = new Map(mapping.map((m) => [m.nom_produit, m]));
  const ventes: VenteChaussure[] = [];
  for (const ligne of lignes) {
    const parsed = parserCouleurTaille(ligne.description);
    if (parsed) {
      ventes.push({ ...parsed, quantite: ligne.quantite, horodatage: ligne.horodatage });
      continue;
    }
    const m = mappingParNom.get(ligne.nom_produit);
    if (!m) continue;
    ventes.push({ couleur: m.couleur, taille: m.taille, quantite: ligne.quantite, horodatage: ligne.horodatage });
  }
  return ventes;
}

/** Associe à chaque ligne de stock son dernier inventaire (le plus récent par couleur/taille) et
 * en déduit ce qu'il faut ramener — cf. décision : "stock de départ moins inventaire, corrigé des
 * ventes SumUp survenues depuis ce comptage" (pas besoin d'attendre un recomptage pour que le
 * réappro reste juste). `stock` est unique et partagé entre pop-ups ; `inventaires` et `ventes`
 * doivent déjà être filtrés sur le pop-up voulu, donc le résultat est propre à ce lieu. */
export function calculerARamener(
  stock: ChaussureStock[],
  inventaires: ChaussureInventaire[],
  ventes: VenteChaussure[] = [],
): ChaussureAvecARamener[] {
  const dernierParItem = new Map<string, ChaussureInventaire>();
  for (const inv of inventaires) {
    const cle = `${inv.couleur}|${inv.taille}`;
    const existant = dernierParItem.get(cle);
    if (!existant || inv.created_at > existant.created_at) dernierParItem.set(cle, inv);
  }
  return stock.map((item) => {
    const dernierInventaire = dernierParItem.get(`${item.couleur}|${item.taille}`) ?? null;
    const venduDepuisInventaire = dernierInventaire
      ? ventes
          .filter(
            (v) =>
              v.couleur === item.couleur && v.taille === item.taille && v.horodatage > dernierInventaire.created_at,
          )
          .reduce((somme, v) => somme + v.quantite, 0)
      : 0;
    const stockEstime = dernierInventaire
      ? Math.max(0, dernierInventaire.quantite_comptee - venduDepuisInventaire)
      : null;
    const aRamener = stockEstime !== null ? Math.max(0, item.stock_initial - stockEstime) : 0;
    return { ...item, dernierInventaire, venduDepuisInventaire, aRamener };
  });
}
