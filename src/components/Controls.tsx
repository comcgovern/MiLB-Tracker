// components/Controls.tsx
import { useUIStore } from '../stores/useUIStore';
import type { Split } from '../types';

const SPLIT_OPTIONS: { value: Split; label: string }[] = [
  { value: 'season', label: 'Season' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last14', label: 'Last 14 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
];

export function Controls() {
  const { activeSplit, setActiveSplit, openAddPlayerModal } = useUIStore();

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
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

          {/* Category selector - placeholder for now */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Categories:
            </label>
            <button className="input text-left">
              Dashboard, Standard, Advanced
            </button>
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
