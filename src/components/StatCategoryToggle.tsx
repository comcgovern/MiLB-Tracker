// components/StatCategoryToggle.tsx
import type { StatCategory } from '../config/statCategories';

interface StatCategoryToggleProps {
  activeCategory: StatCategory;
  onCategoryChange: (category: StatCategory) => void;
  hasStatcast?: boolean;
  hasArsenal?: boolean;
  playerType?: 'batter' | 'pitcher';
}

export function StatCategoryToggle({
  activeCategory,
  onCategoryChange,
  hasStatcast = true,
  hasArsenal = false,
  playerType = 'batter',
}: StatCategoryToggleProps) {
  const categories: { key: StatCategory; label: string }[] = [
    { key: 'standard', label: 'Standard' },
    { key: 'advanced', label: 'Advanced' },
    { key: 'statcast', label: 'Statcast' },
  ];

  // Add Arsenal tab only for pitchers
  if (playerType === 'pitcher') {
    categories.push({ key: 'arsenal', label: 'Arsenal' });
  }

  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      {categories.map(({ key, label }) => {
        const isActive = activeCategory === key;
        const isDisabled = (key === 'statcast' && !hasStatcast) || (key === 'arsenal' && !hasArsenal);

        return (
          <button
            key={key}
            type="button"
            onClick={() => !isDisabled && onCategoryChange(key)}
            disabled={isDisabled}
            className={`
              px-3 py-1.5 text-xs font-medium border
              first:rounded-l-md last:rounded-r-md
              focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500
              ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                  : isDisabled
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600 dark:border-gray-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-800'
              }
            `}
            title={isDisabled ? 'No Statcast data available' : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
