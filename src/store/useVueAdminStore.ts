import { create } from 'zustand';

interface VueAdminState {
  /** Profil actuellement prévisualisé par un admin (n'importe qui — alternant, manager, employé
   * — pas seulement les deux profils de test d'avant, cf. retour utilisateur du 2026-08-24 :
   * "je veux pouvoir aller sur tous les profils"), ou null pour voir l'app comme soi-même. */
  profilPreviewId: string | null;
  definirProfilPreview: (profilId: string | null) => void;
}

/** Permet à un admin de se connecter au profil de n'importe qui pour voir l'app exactement comme
 * cette personne (bascule d'affichage uniquement, cf. sélecteur dans Profil). */
export const useVueAdminStore = create<VueAdminState>((set) => ({
  profilPreviewId: null,
  definirProfilPreview: (profilPreviewId) => set({ profilPreviewId }),
}));
