// stores/useUIStore.ts
import { create } from 'zustand';
import type { Split, Player } from '../types';

interface ConfirmModalState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'danger' | 'default';
}

interface UIStore {
  activeTeamId: string | null;
  activeSplit: Split;
  showDashboard: boolean;  // Whether to show dashboard view
  isAddPlayerModalOpen: boolean;
  isAddTeamModalOpen: boolean;
  isSettingsModalOpen: boolean;
  isDateRangeModalOpen: boolean;
  customDateRange: { start: string; end: string } | null;
  gameLogPlayer: Player | null;  // Player to show game log for
  confirmModal: ConfirmModalState | null;  // Confirm modal state

  setActiveTeamId: (teamId: string | null) => void;
  setActiveSplit: (split: Split) => void;
  setShowDashboard: (show: boolean) => void;
  goToDashboard: () => void;
  goToTeam: (teamId: string) => void;
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
  openGameLog: (player: Player) => void;
  closeGameLog: () => void;
  openConfirmModal: (state: ConfirmModalState) => void;
  closeConfirmModal: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTeamId: null,
  activeSplit: 'season',
  showDashboard: true,  // Start on dashboard by default
  isAddPlayerModalOpen: false,
  isAddTeamModalOpen: false,
  isSettingsModalOpen: false,
  isDateRangeModalOpen: false,
  customDateRange: null,
  gameLogPlayer: null,
  confirmModal: null,

  setActiveTeamId: (teamId) =>
    set({ activeTeamId: teamId }),

  setActiveSplit: (split) =>
    set({ activeSplit: split }),

  setShowDashboard: (show) =>
    set({ showDashboard: show }),

  goToDashboard: () =>
    set({ showDashboard: true, activeTeamId: null }),

  goToTeam: (teamId) =>
    set({ showDashboard: false, activeTeamId: teamId }),

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
    set({ customDateRange: { start, end }, activeSplit: 'custom' }),

  clearCustomDateRange: () =>
    set({ customDateRange: null }),

  openGameLog: (player) =>
    set({ gameLogPlayer: player }),

  closeGameLog: () =>
    set({ gameLogPlayer: null }),

  openConfirmModal: (state) =>
    set({ confirmModal: state }),

  closeConfirmModal: () =>
    set({ confirmModal: null }),
}));
