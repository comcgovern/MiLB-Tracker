// components/TabBar.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';

export function TabBar() {
  const teams = useLiveQuery(() =>
    db.teams.orderBy('displayOrder').toArray()
  );

  const { activeTeamId, setActiveTeamId, openAddTeamModal } = useUIStore();

  // Set first team as active if none selected
  if (teams && teams.length > 0 && !activeTeamId) {
    setActiveTeamId(teams[0].id!);
  }

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6">
      <div className="flex items-center gap-2 overflow-x-auto">
        {teams?.map((team) => (
          <button
            key={team.id}
            onClick={() => setActiveTeamId(team.id!)}
            className={`
              px-4 py-3 font-medium whitespace-nowrap border-b-2 transition-colors
              ${
                activeTeamId === team.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }
            `}
          >
            {team.name}
            {team.isWatchlist && ' ⭐'}
          </button>
        ))}

        <button
          onClick={openAddTeamModal}
          className="px-4 py-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Add team"
        >
          + Add Team
        </button>
      </div>
    </div>
  );
}
