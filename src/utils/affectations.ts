import type { PopUp, ProfilPopUp, Profile } from '@/types/database.types';

/** profile_id -> ensemble des pop_up_id auxquels cette personne est attribuée. */
export function construireMapAffectations(affectations: ProfilPopUp[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const a of affectations) {
    const ensemble = map.get(a.profile_id) ?? new Set<string>();
    ensemble.add(a.pop_up_id);
    map.set(a.profile_id, ensemble);
  }
  return map;
}

/** Un admin est considéré attribué à tous les lieux (il gère son planning entièrement à la
 * main) ; tout le monde d'autre ne peut être planifié qu'aux lieux qui lui sont attribués. */
export function estAttribueA(profile: Profile, popUpId: string, mapAffectations: Map<string, Set<string>>): boolean {
  if (profile.role === 'admin') return true;
  return mapAffectations.get(profile.id)?.has(popUpId) ?? false;
}

/** Les lieux auxquels une personne peut être planifiée (tous, si admin). */
export function popUpsAttribues(
  profile: Profile,
  mapAffectations: Map<string, Set<string>>,
  tousLesPopUps: PopUp[],
): PopUp[] {
  if (profile.role === 'admin') return tousLesPopUps;
  const ids = mapAffectations.get(profile.id);
  if (!ids) return [];
  return tousLesPopUps.filter((p) => ids.has(p.id));
}

/** Couleur à utiliser pour une case/pastille qui affiche juste le nom d'un salarié (sans créneau
 * déjà visible à côté, donc sans indication de lieu) : celle du pop-up auquel il est attribué,
 * pour repérer en un coup d'œil où il travaille. `undefined` = rester neutre/blanc, dans deux cas :
 * - un admin, considéré attribué à tous les lieux (cf. estAttribueA) : aucune couleur unique n'a de
 *   sens pour lui ;
 * - une personne sans aucun pop-up attribué (ne devrait pas arriver pour un profil actif, mais
 *   mieux vaut rester neutre que mentir avec une couleur arbitraire).
 * Cas d'une personne attribuée à plusieurs pop-ups (M2M via profil_pop_ups) : on prend le premier
 * de la liste (ordre de `tousLesPopUps`) plutôt que de rester neutre — choix simple et
 * déterministe, plus informatif qu'une case blanche pour la majorité des cas où ça arrive. */
export function couleurCaseNomSalarie(
  profile: Profile,
  mapAffectations: Map<string, Set<string>>,
  tousLesPopUps: PopUp[],
): string | undefined {
  if (profile.role === 'admin') return undefined;
  return popUpsAttribues(profile, mapAffectations, tousLesPopUps)[0]?.couleur;
}

/** Indice de tri pour regrouper la colonne des noms par pop-up attribué (même premier pop-up que
 * `couleurCaseNomSalarie`, pour rester cohérent avec la couleur affichée) — les admins et les
 * profils sans pop-up attribué passent en dernier, aucun groupe pertinent pour eux. */
export function indexTriParPopUp(
  profile: Profile,
  mapAffectations: Map<string, Set<string>>,
  tousLesPopUps: PopUp[],
): number {
  if (profile.role === 'admin') return tousLesPopUps.length;
  const popUp = popUpsAttribues(profile, mapAffectations, tousLesPopUps)[0];
  const index = popUp ? tousLesPopUps.indexOf(popUp) : -1;
  return index === -1 ? tousLesPopUps.length : index;
}

/** Trie une liste de profils par pop-up attribué (cf. `indexTriParPopUp`), stable au sein d'un même
 * groupe — sert à afficher les colonnes "noms" du calendrier regroupées par lieu plutôt que dans
 * un ordre arbitraire. */
export function trierParPopUpAttribue(
  profils: Profile[],
  mapAffectations: Map<string, Set<string>>,
  tousLesPopUps: PopUp[],
): Profile[] {
  return [...profils].sort(
    (a, b) => indexTriParPopUp(a, mapAffectations, tousLesPopUps) - indexTriParPopUp(b, mapAffectations, tousLesPopUps),
  );
}
