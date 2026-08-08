import { create } from 'zustand';

export type VueAdmin = 'admin' | 'alternant' | 'manager';

interface VueAdminState {
  vue: VueAdmin;
  definirVue: (vue: VueAdmin) => void;
}

/** Permet à un admin de prévisualiser l'app comme un alternant ou un manager (bascule d'affichage
 * uniquement). */
export const useVueAdminStore = create<VueAdminState>((set) => ({
  vue: 'admin',
  definirVue: (vue) => set({ vue }),
}));
