/** Calcul générique "à ramener" partagé par chaussures/coques/sacs (cf. src/utils/chaussures.ts,
 * coques.ts, sacs.ts) : stock de départ moins le dernier inventaire compté par le pop-up, corrigé
 * des ventes SumUp survenues depuis ce comptage — même logique quelles que soient les dimensions
 * de la variante (couleur/taille pour les chaussures, modèle/variante/couleur pour les coques,
 * produit/couleur pour les sacs), d'où l'extraction ici plutôt que trois copies de ce calcul.
 * `cleStock`/`cleInventaire`/`cleVente` doivent produire la même clé pour la même variante d'un
 * type à l'autre (ex. `${couleur}|${taille}`). */
export function calculerARamenerGenerique<
  TStock extends { stock_initial: number },
  TInv extends { created_at: string; quantite_comptee: number },
  TVente extends { quantite: number; horodatage: string },
>(
  stock: TStock[],
  inventaires: TInv[],
  ventes: TVente[],
  cleStock: (item: TStock) => string,
  cleInventaire: (inv: TInv) => string,
  cleVente: (vente: TVente) => string,
): (TStock & {
  dernierInventaire: TInv | null;
  /** Ventes mappées à cette variante survenues depuis le dernier inventaire — 0 tant qu'aucun
   * inventaire n'a été fait (rien à quoi comparer un horodatage). */
  venduDepuisInventaire: number;
  /** dernier inventaire compté - ventes depuis ce comptage, jamais négatif — "ce qu'il devrait
   * rester" en stock à cet instant. null tant qu'aucun inventaire n'a été fait. */
  stockEstime: number | null;
  /** stock_initial - stockEstime, jamais négatif. 0 tant qu'aucun inventaire n'a été fait pour
   * cette variante (on ne peut pas savoir ce qui manque sans avoir compté). */
  aRamener: number;
})[] {
  const dernierParCle = new Map<string, TInv>();
  for (const inv of inventaires) {
    const cle = cleInventaire(inv);
    const existant = dernierParCle.get(cle);
    if (!existant || inv.created_at > existant.created_at) dernierParCle.set(cle, inv);
  }
  return stock.map((item) => {
    const cle = cleStock(item);
    const dernierInventaire = dernierParCle.get(cle) ?? null;
    const venduDepuisInventaire = dernierInventaire
      ? ventes
          .filter((v) => cleVente(v) === cle && v.horodatage > dernierInventaire.created_at)
          .reduce((somme, v) => somme + v.quantite, 0)
      : 0;
    const stockEstime = dernierInventaire
      ? Math.max(0, dernierInventaire.quantite_comptee - venduDepuisInventaire)
      : null;
    const aRamener = stockEstime !== null ? Math.max(0, item.stock_initial - stockEstime) : 0;
    return { ...item, dernierInventaire, venduDepuisInventaire, stockEstime, aRamener };
  });
}
