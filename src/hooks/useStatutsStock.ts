import { useMemo } from 'react';

import { useCommandeActiveConsommables } from '@/hooks/useConsommables';
import { useCommandeActiveProduits } from '@/hooks/useProduits';
import { useSaisiesCommande } from '@/hooks/useSaisiesCommande';
import { useCommandeActivePopUp, useCommandesTerminees, useDerniersRemplissages, useGrillePopUp } from '@/hooks/useStock';
import type { CategorieSaisieStock, StockSaisieCommande } from '@/types/database.types';

export type CategorieColonneStock = 'pins' | CategorieSaisieStock;

/** Ordre de la colonne de l'onglet Stock (retour utilisateur du 2026-10-23 : pin's en premier,
 * puis chaussures, coques et le reste des produits). */
export const ORDRE_COLONNE_STOCK: CategorieColonneStock[] = ['pins', 'chaussures', 'coques', 'sacs', 'lanieres', 'consommables'];

/** Statut d'une commande déjà partie et pas encore reçue pour la famille de la catégorie (pin's,
 * produits ou consommables) — tant qu'elle est en vol, aucune nouvelle commande de cette famille
 * ne peut partir (une seule active par pop-up, contrainte en base). */
export type EtatCommandeEnVol = 'en_preparation' | 'prete' | null;

export interface StatutCategorieStock {
  vert: boolean;
  /** Sous-titre affiché dans la case ("3/5 boîtes validées", "4 articles", "À faire"...). */
  detail: string;
  commandeEnVol: EtatCommandeEnVol;
}

/** Calcule, pour chaque case de la colonne Stock d'un pop-up, si elle est verte :
 * - Pin's : toutes les boîtes qui contiennent des pin's ont un "Valider le remplissage" postérieur
 *   à la dernière commande de pin's envoyée (le compteur repart de zéro à chaque envoi).
 * - Produits / consommables : une saisie a été validée depuis le dernier envoi (la ligne
 *   stock_saisies_commande est supprimée une fois la commande partie, cf. migration 0125). */
export function useStatutsStock(popUpId: string | undefined) {
  const { data: grille, isLoading: l1 } = useGrillePopUp(popUpId);
  const { data: derniersRemplissages, isLoading: l2 } = useDerniersRemplissages(popUpId);
  const { data: commandePins } = useCommandeActivePopUp(popUpId);
  const { data: historiquePins, isLoading: l3 } = useCommandesTerminees(popUpId);
  const { data: commandeProduits } = useCommandeActiveProduits(popUpId);
  const { data: commandeConsommables } = useCommandeActiveConsommables(popUpId);
  const { data: saisies, isLoading: l4 } = useSaisiesCommande(popUpId);

  const statuts = useMemo(() => {
    const derniereCommandePins = Math.max(
      0,
      ...[commandePins?.commande.envoyee_at, historiquePins?.[0]?.commande.envoyee_at]
        .filter((d): d is string => !!d)
        .map((d) => new Date(d).getTime()),
    );
    const casesRemplies = (grille ?? []).filter((c) => c.contenus.length > 0).map((c) => c.casePosition);
    const boitesAFaire = casesRemplies.filter((position) => {
      const dernier = derniersRemplissages?.find((r) => r.casePosition === position);
      return !dernier || new Date(dernier.createdAt).getTime() <= derniereCommandePins;
    });
    const nbValidees = casesRemplies.length - boitesAFaire.length;

    const etatPins: EtatCommandeEnVol = commandePins
      ? commandePins.commande.statut === 'prete'
        ? 'prete'
        : 'en_preparation'
      : null;
    const etatProduits: EtatCommandeEnVol = commandeProduits
      ? commandeProduits.commande.statut === 'envoyee'
        ? 'prete'
        : 'en_preparation'
      : null;
    const etatConsommables: EtatCommandeEnVol = commandeConsommables
      ? commandeConsommables.commande.statut === 'envoyee'
        ? 'prete'
        : 'en_preparation'
      : null;

    const parCategorie = new Map<CategorieSaisieStock, StockSaisieCommande>((saisies ?? []).map((s) => [s.categorie, s]));
    const statutSaisie = (categorie: CategorieSaisieStock, enVol: EtatCommandeEnVol): StatutCategorieStock => {
      const saisie = parCategorie.get(categorie);
      if (!saisie) return { vert: false, detail: 'À faire', commandeEnVol: enVol };
      const nbArticles =
        categorie === 'consommables'
          ? Object.keys(saisie.quantites).length
          : Object.values(saisie.quantites).reduce((s, q) => s + q, 0);
      const unite = categorie === 'consommables' ? 'type' : 'article';
      return {
        vert: true,
        detail: nbArticles === 0 ? 'Rien à commander' : `${nbArticles} ${unite}${nbArticles > 1 ? 's' : ''} à commander`,
        commandeEnVol: enVol,
      };
    };

    const resultat: Record<CategorieColonneStock, StatutCategorieStock> = {
      pins: {
        vert: casesRemplies.length === 0 || nbValidees === casesRemplies.length,
        detail:
          casesRemplies.length === 0
            ? 'Aucune boîte remplie'
            : `${nbValidees}/${casesRemplies.length} boîte${casesRemplies.length > 1 ? 's' : ''} validée${nbValidees > 1 ? 's' : ''}`,
        commandeEnVol: etatPins,
      },
      chaussures: statutSaisie('chaussures', etatProduits),
      coques: statutSaisie('coques', etatProduits),
      sacs: statutSaisie('sacs', etatProduits),
      lanieres: statutSaisie('lanieres', etatProduits),
      consommables: statutSaisie('consommables', etatConsommables),
    };
    return { resultat, boitesAFaire };
  }, [grille, derniersRemplissages, commandePins, historiquePins, commandeProduits, commandeConsommables, saisies]);

  const nonVertes = ORDRE_COLONNE_STOCK.filter((c) => !statuts.resultat[c].vert);
  return {
    statuts: statuts.resultat,
    nonVertes,
    /** Boîtes de pin's remplies sans "Valider le remplissage" depuis la dernière commande. */
    boitesAFaire: statuts.boitesAFaire,
    saisies: saisies ?? [],
    chargement: l1 || l2 || l3 || l4,
  };
}
