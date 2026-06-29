/**
 * Filter store (Zustand) - Shared filter state across pages
 */
import { create } from 'zustand';

interface FilterStore {
  csatCycleId?: number;
  projectId?: number;
  dateRange?: { start: string; end: string };

  setCsatCycleId: (id?: number) => void;
  setProjectId: (id?: number) => void;
  setDateRange: (range?: { start: string; end: string }) => void;
  clearFilters: () => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  csatCycleId: undefined,
  projectId: undefined,
  dateRange: undefined,

  setCsatCycleId: (id) => set({ csatCycleId: id }),
  setProjectId: (id) => set({ projectId: id }),
  setDateRange: (range) => set({ dateRange: range }),
  clearFilters: () =>
    set({
      csatCycleId: undefined,
      projectId: undefined,
      dateRange: undefined,
    }),
}));
