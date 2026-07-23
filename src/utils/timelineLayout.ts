export function versMinutes(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

/** Inverse de `versMinutes` : reconstruit une heure "HH:MM:00" à partir d'un nombre de minutes. */
export function minutesVersHeure(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export interface ElementPositionne<T> {
  item: T;
  colIndex: number;
  colCount: number;
}

/**
 * Positionne des éléments ayant un heure_debut/heure_fin sur une grille façon agenda :
 * les éléments qui se chevauchent dans le temps se répartissent en colonnes côte à côte.
 */
export function positionnerChevauchements<T extends { heure_debut: string; heure_fin: string }>(
  items: T[],
): ElementPositionne<T>[] {
  const tries = [...items].sort(
    (a, b) => versMinutes(a.heure_debut) - versMinutes(b.heure_debut) || versMinutes(a.heure_fin) - versMinutes(b.heure_fin),
  );

  const clusters: T[][] = [];
  let clusterCourant: T[] = [];
  let finClusterCourant = -Infinity;

  for (const item of tries) {
    const debut = versMinutes(item.heure_debut);
    if (clusterCourant.length > 0 && debut >= finClusterCourant) {
      clusters.push(clusterCourant);
      clusterCourant = [];
      finClusterCourant = -Infinity;
    }
    clusterCourant.push(item);
    finClusterCourant = Math.max(finClusterCourant, versMinutes(item.heure_fin));
  }
  if (clusterCourant.length > 0) clusters.push(clusterCourant);

  const resultats: ElementPositionne<T>[] = [];
  for (const cluster of clusters) {
    const finColonnes: number[] = [];
    const positionsCluster: ElementPositionne<T>[] = [];

    for (const item of cluster) {
      const debut = versMinutes(item.heure_debut);
      let colIndex = finColonnes.findIndex((fin) => fin <= debut);
      if (colIndex === -1) {
        colIndex = finColonnes.length;
        finColonnes.push(versMinutes(item.heure_fin));
      } else {
        finColonnes[colIndex] = versMinutes(item.heure_fin);
      }
      positionsCluster.push({ item, colIndex, colCount: 0 });
    }

    const colCount = finColonnes.length;
    for (const p of positionsCluster) {
      p.colCount = colCount;
      resultats.push(p);
    }
  }

  return resultats;
}

export function minutesDepuis(heureReference: string, heure: string): number {
  return versMinutes(heure) - versMinutes(heureReference);
}
