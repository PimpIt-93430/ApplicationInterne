import { addWeeks } from 'date-fns';
import { create } from 'zustand';

interface SemaineState {
  dateReference: Date;
  semaineSuivante: () => void;
  semainePrecedente: () => void;
  revenirAujourdhui: () => void;
}

export const useSemaineStore = create<SemaineState>((set) => ({
  dateReference: new Date(),
  semaineSuivante: () => set((s) => ({ dateReference: addWeeks(s.dateReference, 1) })),
  semainePrecedente: () => set((s) => ({ dateReference: addWeeks(s.dateReference, -1) })),
  revenirAujourdhui: () => set({ dateReference: new Date() }),
}));
