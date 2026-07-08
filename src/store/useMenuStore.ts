import { create } from 'zustand';

interface MenuState {
  ouvert: boolean;
  ouvrir: () => void;
  fermer: () => void;
  toggle: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  ouvert: false,
  ouvrir: () => set({ ouvert: true }),
  fermer: () => set({ ouvert: false }),
  toggle: () => set((s) => ({ ouvert: !s.ouvert })),
}));
