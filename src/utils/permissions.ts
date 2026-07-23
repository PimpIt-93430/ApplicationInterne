import type { DroitEmploye, Fonctionnalite } from '@/types/database.types';

/** Miroir client de la fonction SQL `a_droit` (migration 0034) — sert aux décisions d'affichage
 * (masquer/montrer un écran ou un lien) ; la vraie sécurité reste la RLS côté serveur. */
export function aDroit(droits: DroitEmploye[], fonctionnalite: Fonctionnalite, popUpId?: string): boolean {
  return droits.some(
    (d) => d.fonctionnalite === fonctionnalite && (d.pop_up_id === null || d.pop_up_id === popUpId),
  );
}

/** A-t-elle un droit sur cette fonctionnalité, peu importe le périmètre — sert à décider d'ouvrir
 * un écran (gate) sans encore connaître un pop-up précis à vérifier, contrairement à `aDroit`. */
export function aAccesFonctionnalite(droits: DroitEmploye[], fonctionnalite: Fonctionnalite): boolean {
  return droits.some((d) => d.fonctionnalite === fonctionnalite);
}

/** Pop-up(s) couverts par les droits d'une personne pour une fonctionnalité donnée — `null` = tous
 * les pop-ups (au moins un droit non scopé), sinon la liste précise des pop_up_id accordés. */
export function popUpsCouverts(droits: DroitEmploye[], fonctionnalite: Fonctionnalite): string[] | null {
  const droitsFonctionnalite = droits.filter((d) => d.fonctionnalite === fonctionnalite);
  if (droitsFonctionnalite.some((d) => d.pop_up_id === null)) return null;
  return droitsFonctionnalite.map((d) => d.pop_up_id as string);
}
