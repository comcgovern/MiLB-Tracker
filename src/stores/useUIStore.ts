// stores/useUIStore.ts
import { create } from 'zustand';
import type { Split, Player } from '../types';

interface UIStore {
  activeTeamId: string | null;
  activeSplit: Split;
  isAddPlayerModalOpen: boolean;
  isAddTeamModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isDateRangeModalOpen: boolean;
  selectedPlayerIds: string[];
  customDateRange: { start: string; end: string } | null;
  gameLogPlayer: Player | null;  // Player to show game log for

  setActiveTeamId: (teamId: string | null) => void;
  setActiveSplit: (split: Split) => void;
  openAddPlayerModal: () => void;
  closeAddPlayerModal: () => void;
  openAddTeamModal: () => void;
  closeAddTeamModal: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openDateRangeModal: () => void;
  closeDateRangeModal: () => void;
  setCustomDateRange: (start: string, end: string) => void;
  clearCustomDateRange: () => void;
  togglePlayerSelection: (playerId: string) => void;
  clearPlayerSelection: () => void;
  openGameLog: (player: Player) => void;
  closeGameLog: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTeamId: null,
  activeSplit: 'yesterday',
  isAddPlayerModalOpen: false,
  isAddTeamModalOpen: false,
  isSettingsModalOpen: false,
  isDateRangeModalOpen: false,
  selectedPlayerIds: [],
  customDateRange: null,
  gameLogPlayer: null,

  setActiveTeamId: (teamId) =>
    set({ activeTeamId: teamId }),

  setActiveSplit: (split) =>
    set({ activeSplit: split }),

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

  openGameLog: (player) =>
    set({ gameLogPlayer: player }),

  closeGameLog: () =>
    set({ gameLogPlayer: null }),
}));
