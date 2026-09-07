import { create } from 'zustand';

// Quantité par pin (palier 100) en préparation pour une prochaine commande — partagée entre
// l'écran Pin's ("Voir la commande et ajuster les quantités", cf. retour utilisateur du
// 2026-09-07 : "si ils en veulent 200 300 etc") et l'écran "Stock > Voir la commande" qui envoie
// réellement. Juste un brouillon en mémoire (pas persisté en base tant que rien n'est envoyé) —
// remis à 100 par défaut si jamais vidé (redémarrage de l'app).
interface CommandeQuantitesState {
  quantites: Record<string, number>;
  quantitePin: (pinId: string) => number;
  ajusterQuantite: (pinId: string, delta: number) => void;
  reinitialiser: (pinIds: string[]) => void;
}

export const useCommandeQuantitesStore = create<CommandeQuantitesState>((set, get) => ({
  quantites: {},
  quantitePin: (pinId) => get().quantites[pinId] ?? 100,
  ajusterQuantite: (pinId, delta) =>
    set((s) => ({
      quantites: { ...s.quantites, [pinId]: Math.max(100, (s.quantites[pinId] ?? 100) + delta) },
    })),
  // Appelé après un envoi réussi : les pins envoyés repartent à 100 par défaut pour la prochaine
  // fois plutôt que de garder la quantité de la commande précédente.
  reinitialiser: (pinIds) =>
    set((s) => {
      const quantites = { ...s.quantites };
      for (const id of pinIds) delete quantites[id];
      return { quantites };
    }),
}));
