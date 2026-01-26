// components/Controls.tsx
import { useUIStore } from '../stores/useUIStore';
import type { Split, SituationalSplit } from '../types';

const SPLIT_OPTIONS: { value: Split; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last14', label: 'Last 14 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'season', label: 'Season' },
  { value: 'lastSeason', label: 'Last Season' },
  { value: 'custom', label: 'Custom Range' },
];

const SITUATIONAL_SPLIT_OPTIONS: { value: SituationalSplit; label: string }[] = [
  { value: 'all', label: 'All Games' },
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
  { value: 'vsL', label: 'vs LHP/LHB' },
  { value: 'vsR', label: 'vs RHP/RHB' },
];

export function Controls() {
  const {
    activeSplit,
    setActiveSplit,
    activeSituationalSplit,
    setActiveSituationalSplit,
    openAddPlayerModal,
    openDateRangeModal,
    customDateRange
  } = useUIStore();

  const handleSplitChange = (split: Split) => {
    if (split === 'custom' && !customDateRange) {
      // Open date picker if selecting custom without a range set
      openDateRangeModal();
    } else {
      setActiveSplit(split);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Split selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Time Period:
            </label>
            <select
              value={activeSplit}
              onChange={(e) => handleSplitChange(e.target.value as Split)}
              className="input"
            >
              {SPLIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Show custom range if set */}
          {customDateRange && (
            <div className="text-sm text-gray-600 dark:text-gray-400 bg-primary-50 dark:bg-primary-900/20 px-3 py-1 rounded">
              Custom: {customDateRange.start} to {customDateRange.end}
            </div>
          )}

          {/* Situational split selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Filter:
            </label>
            <select
              value={activeSituationalSplit}
              onChange={(e) => setActiveSituationalSplit(e.target.value as SituationalSplit)}
              className="input"
            >
              {SITUATIONAL_SPLIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Add player button */}
        <button
          onClick={openAddPlayerModal}
          className="btn-primary"
        >
          + Add Player
        </button>
      </div>
    </div>
  );
}
