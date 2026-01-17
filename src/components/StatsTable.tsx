// components/StatsTable.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import type { PlayersRegistry, StatsFile, BattingStats, PitchingStats } from '../types';

async function fetchPlayers(): Promise<PlayersRegistry> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/players.json`);
  if (!response.ok) throw new Error('Failed to fetch players');
  return response.json();
}

async function fetchStats(): Promise<StatsFile> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/stats/2025.json`);
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export function StatsTable() {
  const { activeTeamId, activeSplit } = useUIStore();
  const { removePlayerFromTeam } = useTeamPlayers(activeTeamId);

  // Fetch team players from IndexedDB
  const teamPlayers = useLiveQuery(
    () => activeTeamId ? db.teamPlayers.where('teamId').equals(activeTeamId).toArray() : [],
    [activeTeamId]
  );

  // Fetch player registry
  const { data: playersRegistry } = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['stats', '2025'],
    queryFn: fetchStats,
  });

  const handleRemovePlayer = async (teamPlayerId: string, playerName: string) => {
    if (confirm(`Remove ${playerName} from this team?`)) {
      await removePlayerFromTeam(teamPlayerId);
    }
  };

  if (!teamPlayers || teamPlayers.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No players added yet. Click "Add Player" to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Player
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Pos
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Level
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Org
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Stat 1
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Stat 2
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Stat 3
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Stat 4
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Stat 5
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {teamPlayers.map((tp) => {
            const player = playersRegistry?.players.find((p) => p.fangraphsId === tp.playerId);
            const playerStats = statsData?.[tp.playerId];

            // Get stats based on active split
            let stats: BattingStats | PitchingStats | undefined;
            if (activeSplit === 'season') {
              stats = playerStats?.season;
            } else if (activeSplit === 'yesterday' || activeSplit === 'today' || activeSplit === 'last7' || activeSplit === 'last14' || activeSplit === 'last30') {
              stats = playerStats?.splits?.[activeSplit];
            }

            const isBatter = playerStats?.type === 'batter';
            const batterStats = stats as BattingStats | undefined;
            const pitcherStats = stats as PitchingStats | undefined;

            return (
              <tr key={tp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {player?.name || 'Unknown'}
                    </span>
                    {player?.hasStatcast && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                        SC
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {player?.position || '--'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {player?.level || '--'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {player?.org || '--'}
                </td>

                {/* Dynamic stats based on player type */}
                {isBatter ? (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">PA</div>
                      {batterStats?.PA || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">AVG</div>
                      {batterStats?.AVG?.toFixed(3) || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">OBP</div>
                      {batterStats?.OBP?.toFixed(3) || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">SLG</div>
                      {batterStats?.SLG?.toFixed(3) || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">HR</div>
                      {batterStats?.HR || '--'}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">IP</div>
                      {pitcherStats?.IP?.toFixed(1) || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">ERA</div>
                      {pitcherStats?.ERA?.toFixed(2) || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">WHIP</div>
                      {pitcherStats?.WHIP?.toFixed(2) || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">K/9</div>
                      {pitcherStats?.['K/9']?.toFixed(1) || '--'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                      <div className="text-xs text-gray-500 dark:text-gray-400">SO</div>
                      {pitcherStats?.SO || '--'}
                    </td>
                  </>
                )}

                <td className="px-6 py-4 whitespace-nowrap text-center">
                  <button
                    onClick={() => handleRemovePlayer(tp.id!, player?.name || 'this player')}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                    title="Remove player from team"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
