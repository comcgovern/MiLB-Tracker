// components/GameLogModal.tsx
import { useQuery } from '@tanstack/react-query';
import type { StatsFile, Player } from '../types';
import { formatStatValue } from '../config/statCategories';

async function fetchStats(): Promise<StatsFile> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const year = new Date().getFullYear();
  let response = await fetch(`${basePath}/data/stats/${year}.json`);
  if (!response.ok) {
    response = await fetch(`${basePath}/data/stats/${year - 1}.json`);
  }
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

interface GameLogModalProps {
  player: Player | null;
  onClose: () => void;
}

export function GameLogModal({ player, onClose }: GameLogModalProps) {
  const { data: statsData, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  if (!player) return null;

  const playerId = player.mlbId || (player as any).fangraphsId;
  const playerStats = statsData?.[playerId];
  const isBatter = playerStats?.type === 'batter' || !!playerStats?.batting;
  const gameLog = isBatter ? playerStats?.battingGameLog : playerStats?.pitchingGameLog;

  // Batting columns
  const battingColumns: { key: string; label: string; format?: 'decimal3' | 'decimal2' }[] = [
    { key: 'AB', label: 'AB' },
    { key: 'H', label: 'H' },
    { key: 'R', label: 'R' },
    { key: 'RBI', label: 'RBI' },
    { key: 'HR', label: 'HR' },
    { key: 'BB', label: 'BB' },
    { key: 'SO', label: 'K' },
    { key: 'SB', label: 'SB' },
    { key: 'AVG', label: 'AVG', format: 'decimal3' },
  ];

  // Pitching columns
  const pitchingColumns: { key: string; label: string; format?: 'decimal3' | 'decimal2' }[] = [
    { key: 'IP', label: 'IP' },
    { key: 'H', label: 'H' },
    { key: 'R', label: 'R' },
    { key: 'ER', label: 'ER' },
    { key: 'BB', label: 'BB' },
    { key: 'SO', label: 'K' },
    { key: 'HR', label: 'HR' },
    { key: 'ERA', label: 'ERA', format: 'decimal2' },
  ];

  const columns = isBatter ? battingColumns : pitchingColumns;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {player.name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {player.position} • {player.org} • {player.level} • {player.team}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Season summary */}
          {playerStats && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Season Totals
              </h3>
              <div className="flex flex-wrap gap-4 text-sm">
                {isBatter && playerStats.batting && (
                  <>
                    <span><strong>{playerStats.batting.G || 0}</strong> G</span>
                    <span><strong>{playerStats.batting.PA || 0}</strong> PA</span>
                    <span><strong>{formatStatValue(playerStats.batting.AVG, 'decimal3')}</strong> AVG</span>
                    <span><strong>{formatStatValue(playerStats.batting.OBP, 'decimal3')}</strong> OBP</span>
                    <span><strong>{formatStatValue(playerStats.batting.SLG, 'decimal3')}</strong> SLG</span>
                    <span><strong>{playerStats.batting.HR || 0}</strong> HR</span>
                    <span><strong>{playerStats.batting.RBI || 0}</strong> RBI</span>
                    <span><strong>{playerStats.batting.SB || 0}</strong> SB</span>
                  </>
                )}
                {!isBatter && playerStats.pitching && (
                  <>
                    <span><strong>{playerStats.pitching.G || 0}</strong> G</span>
                    <span><strong>{playerStats.pitching.IP || 0}</strong> IP</span>
                    <span><strong>{formatStatValue(playerStats.pitching.ERA, 'decimal2')}</strong> ERA</span>
                    <span><strong>{formatStatValue(playerStats.pitching.WHIP, 'decimal2')}</strong> WHIP</span>
                    <span><strong>{playerStats.pitching.SO || 0}</strong> K</span>
                    <span><strong>{playerStats.pitching.W || 0}-{playerStats.pitching.L || 0}</strong> W-L</span>
                    <span><strong>{playerStats.pitching.SV || 0}</strong> SV</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Game Log */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              Loading game log...
            </div>
          ) : isError ? (
            <div className="p-8 text-center">
              <p className="text-red-600 dark:text-red-400">Failed to load game log</p>
            </div>
          ) : !gameLog || gameLog.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No game log data available
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Opp
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {gameLog.map((game, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {formatGameDate(game.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {game.isHome === false && '@'}{game.opponent || '--'}
                      </td>
                      {columns.map((col) => {
                        const value = game.stats?.[col.key as keyof typeof game.stats];
                        return (
                          <td
                            key={col.key}
                            className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white"
                          >
                            {col.format
                              ? formatStatValue(value as number, col.format)
                              : (value ?? '--')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="btn-secondary w-full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function formatGameDate(dateString: string): string {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}
