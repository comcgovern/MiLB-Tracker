// components/TabBar.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeams } from '../hooks/useTeams';

export function TabBar() {
  const teams = useLiveQuery(() =>
    db.teams.orderBy('displayOrder').toArray()
  );

  const { activeTeamId, setActiveTeamId, openAddTeamModal } = useUIStore();
  const { deleteTeam } = useTeams();

  // Set first team as active if none selected
  if (teams && teams.length > 0 && !activeTeamId) {
    setActiveTeamId(teams[0].id!);
  }

  const handleDeleteTeam = async (e: React.MouseEvent, teamId: string, teamName: string) => {
    e.stopPropagation(); // Prevent tab selection

    if (confirm(`Delete team "${teamName}" and all its players? This cannot be undone.`)) {
      await deleteTeam(teamId);

      // If we deleted the active team, clear selection
      if (activeTeamId === teamId) {
        setActiveTeamId(null);
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6">
      <div className="flex items-center gap-2 overflow-x-auto">
        {teams?.map((team) => (
          <div key={team.id} className="relative group">
            <button
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

            {/* Delete button - appears on hover */}
            <button
              onClick={(e) => handleDeleteTeam(e, team.id!, team.name)}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
              title={`Delete ${team.name}`}
              aria-label={`Delete ${team.name}`}
            >
              ×
            </button>
          </div>
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
