/** UUID v4 léger, sans dépendance native — sert uniquement d'identifiant client pour une ligne de
 * panier (colonne `commande_produits_lignes.produit_id`, type uuid mais sans contrainte FK, cf.
 * migration 0098 : "pas de contrainte FK unique possible vers 3 tables différentes"), jamais pour
 * de la cryptographie. */
export function uuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
