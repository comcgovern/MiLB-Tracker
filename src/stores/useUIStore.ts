// stores/useUIStore.ts
import { create } from 'zustand';
import type { Split } from '../types';

interface UIStore {
  activeTeamId: string | null;
  activeSplit: Split;
  searchQuery: string;
  isAddPlayerModalOpen: boolean;
  isAddTeamModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isDateRangeModalOpen: boolean;
  isSearchNewPlayerModalOpen: boolean;
  selectedPlayerIds: string[];
  customDateRange: { start: string; end: string } | null;

  setActiveTeamId: (teamId: string | null) => void;
  setActiveSplit: (split: Split) => void;
  setSearchQuery: (query: string) => void;
  openAddPlayerModal: () => void;
  closeAddPlayerModal: () => void;
  openAddTeamModal: () => void;
  closeAddTeamModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openDateRangeModal: () => void;
  closeDateRangeModal: () => void;
  openSearchNewPlayerModal: () => void;
  closeSearchNewPlayerModal: () => void;
  setCustomDateRange: (start: string, end: string) => void;
  clearCustomDateRange: () => void;
  togglePlayerSelection: (playerId: string) => void;
  clearPlayerSelection: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTeamId: null,
  activeSplit: 'yesterday',
  searchQuery: '',
  isAddPlayerModalOpen: false,
  isAddTeamModalOpen: false,
  isSettingsModalOpen: false,
  isDateRangeModalOpen: false,
  isSearchNewPlayerModalOpen: false,
  selectedPlayerIds: [],
  customDateRange: null,

  setActiveTeamId: (teamId) =>
    set({ activeTeamId: teamId }),

  setActiveSplit: (split) =>
    set({ activeSplit: split }),

  setSearchQuery: (query) =>
    set({ searchQuery: query }),

  openAddPlayerModal: () =>
    set({ isAddPlayerModalOpen: true }),

  closeAddPlayerModal: () =>
    set({ isAddPlayerModalOpen: false }),

  openAddTeamModal: () =>
    set({ isAddTeamModalOpen: true }),

  closeAddTeamModal: () =>
    set({ isAddTeamModalOpen: false }),

  openSettingsModal: () =>
    set({ isSettingsModalOpen: true }),

  closeSettingsModal: () =>
    set({ isSettingsModalOpen: false }),

  openDateRangeModal: () =>
    set({ isDateRangeModalOpen: true }),

  closeDateRangeModal: () =>
    set({ isDateRangeModalOpen: false }),

  openSearchNewPlayerModal: () =>
    set({ isSearchNewPlayerModalOpen: true }),

  closeSearchNewPlayerModal: () =>
    set({ isSearchNewPlayerModalOpen: false }),

  setCustomDateRange: (start, end) =>
    set({ customDateRange: { start, end } }),

  clearCustomDateRange: () =>
    set({ customDateRange: null }),

  togglePlayerSelection: (playerId) =>
    set((state) => ({
      selectedPlayerIds: state.selectedPlayerIds.includes(playerId)
        ? state.selectedPlayerIds.filter((id) => id !== playerId)
        : [...state.selectedPlayerIds, playerId],
    })),

  clearPlayerSelection: () =>
    set({ selectedPlayerIds: [] }),
}));
