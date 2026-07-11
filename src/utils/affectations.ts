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
