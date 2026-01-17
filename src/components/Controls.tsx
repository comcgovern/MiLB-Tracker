// components/Controls.tsx
import { useUIStore } from '../stores/useUIStore';
import type { Split } from '../types';

const SPLIT_OPTIONS: { value: Split; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last14', label: 'Last 14 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'season', label: 'Season' },
];

export function Controls() {
  const { activeSplit, setActiveSplit, openAddPlayerModal, openDateRangeModal, customDateRange } = useUIStore();

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
              onChange={(e) => setActiveSplit(e.target.value as Split)}
              className="input"
            >
              {SPLIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Range Button */}
          <button
            onClick={openDateRangeModal}
            className="btn-secondary text-sm"
          >
            📅 Custom Range
          </button>

          {/* Show custom range if set */}
          {customDateRange && (
            <div className="text-sm text-gray-600 dark:text-gray-400 bg-primary-50 dark:bg-primary-900/20 px-3 py-1 rounded">
              Custom: {customDateRange.start} to {customDateRange.end}
            </div>
          )}
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
