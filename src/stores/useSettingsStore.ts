// stores/useSettingsStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Split } from '../types';

interface SettingsStore {
  darkMode: boolean;
  defaultSplit: Split;
  autoRefreshInterval: number; // minutes
  selectedCategories: string[];
  toggleDarkMode: () => void;
  setDefaultSplit: (split: Split) => void;
  setAutoRefreshInterval: (interval: number) => void;
  toggleCategory: (category: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      darkMode: false,
      defaultSplit: 'season',
      autoRefreshInterval: 60,
      selectedCategories: ['dashboard', 'standard', 'advanced'],

      toggleDarkMode: () =>
        set((state) => ({ darkMode: !state.darkMode })),

      setDefaultSplit: (split: Split) =>
        set({ defaultSplit: split }),

      setAutoRefreshInterval: (interval: number) =>
        set({ autoRefreshInterval: interval }),

      toggleCategory: (category: string) =>
        set((state) => ({
          selectedCategories: state.selectedCategories.includes(category)
            ? state.selectedCategories.filter((c) => c !== category)
            : [...state.selectedCategories, category],
        })),
    }),
    {
      name: 'milb-settings',
    }
  )
);
