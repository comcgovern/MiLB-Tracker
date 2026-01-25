// components/SettingsModal.tsx
import { useUIStore } from '../stores/useUIStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { Split } from '../types';

const SPLIT_OPTIONS: { value: Split; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last14', label: 'Last 14 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'season', label: 'Full Season' },
];

const CATEGORY_OPTIONS = [
  { value: 'standard', label: 'Standard Stats', description: 'Basic counting and rate stats (AVG, HR, RBI, etc.)' },
  { value: 'advanced', label: 'Advanced Stats', description: 'Sabermetric stats (wOBA, wRC+, BABIP, FIP, etc.)' },
  { value: 'statcast', label: 'Statcast Stats', description: 'Batted ball data (EV, LA, Barrel%, xBA, etc.)' },
];

export function SettingsModal() {
  const { isSettingsModalOpen, closeSettingsModal } = useUIStore();
  const {
    darkMode,
    defaultSplit,
    autoRefreshInterval,
    selectedCategories,
    toggleDarkMode,
    setDefaultSplit,
    setAutoRefreshInterval,
    toggleCategory,
  } = useSettingsStore();

  if (!isSettingsModalOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="card max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2
              id="settings-modal-title"
              className="text-xl font-bold text-gray-900 dark:text-white"
            >
              Settings
            </h2>
            <button
              onClick={closeSettingsModal}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Appearance */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
              Appearance
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Dark Mode
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Use dark theme for reduced eye strain
                </p>
              </div>
              <button
                onClick={toggleDarkMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  darkMode ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                role="switch"
                aria-checked={darkMode}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    darkMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Default View */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
              Default View
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Default Time Period
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Time period shown when opening the app
                </p>
                <select
                  value={defaultSplit}
                  onChange={(e) => setDefaultSplit(e.target.value as Split)}
                  className="input w-full"
                >
                  {SPLIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Stat Categories */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
              Stat Categories
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Choose which stat categories to display
            </p>
            <div className="space-y-3">
              {CATEGORY_OPTIONS.map((category) => (
                <label
                  key={category.value}
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category.value)}
                    onChange={() => toggleCategory(category.value)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {category.label}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {category.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Data */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
              Data
            </h3>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-refresh Interval
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                How often to check for updated stats (in minutes)
              </p>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="input w-full"
              >
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
                <option value={120}>Every 2 hours</option>
                <option value={0}>Disabled</option>
              </select>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={closeSettingsModal}
            className="btn-primary w-full"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
