// components/Header.tsx
import { useSettingsStore } from '../stores/useSettingsStore';
import { useUIStore } from '../stores/useUIStore';
import { DataStatusIndicator } from './DataStatusIndicator';

export function Header() {
  const { darkMode, toggleDarkMode } = useSettingsStore();
  const { openSettingsModal } = useUIStore();

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            MiLB Stats Tracker
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>

          {/* Settings */}
          <button
            onClick={openSettingsModal}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Settings"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Last updated info */}
      <div className="mt-2">
        <DataStatusIndicator />
      </div>
    </header>
  );
}
