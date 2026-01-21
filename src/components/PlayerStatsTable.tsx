// components/PlayerStatsTable.tsx
import { useState } from 'react';
import { StatCategoryToggle } from './StatCategoryToggle';
import {
  type StatCategory,
  type StatColumn,
  BATTING_STATS,
  PITCHING_STATS,
  formatStatValue,
} from '../config/statCategories';
import type { Player, BattingStats, PitchingStats, MiLBLevel } from '../types';
import type { DBTeamPlayer } from '../db';

interface PlayerRow {
  teamPlayer: DBTeamPlayer;
  player: Player | undefined;
  stats: BattingStats | PitchingStats | undefined;
  level?: MiLBLevel;  // The level for this row (undefined = use player.level)
  isTotal?: boolean;  // true for MiLB total rows
}

interface PlayerStatsTableProps {
  title: string;
  type: 'batter' | 'pitcher';
  players: PlayerRow[];
  onRemovePlayer: (teamPlayerId: string, playerName: string) => void;
  onPlayerClick?: (player: Player) => void;
}

export function PlayerStatsTable({
  title,
  type,
  players,
  onRemovePlayer,
  onPlayerClick,
}: PlayerStatsTableProps) {
  const [activeCategory, setActiveCategory] = useState<StatCategory>('standard');

  // Check if any player in this table has Statcast data
  const anyHasStatcast = players.some((p) => p.player?.hasStatcast);

  // Get the stat columns for the current category and player type
  const statColumns: StatColumn[] =
    type === 'batter' ? BATTING_STATS[activeCategory] : PITCHING_STATS[activeCategory];

  // If Statcast is selected but no one has it, show message
  const showStatcastNA = activeCategory === 'statcast' && !anyHasStatcast;

  if (players.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3 px-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            ({players.length})
          </span>
        </h3>
        <StatCategoryToggle
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          hasStatcast={anyHasStatcast}
        />
      </div>

      {/* Table with horizontal scroll for stats */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {/* Fixed columns */}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap sticky left-0 bg-gray-50 dark:bg-gray-800 z-10">
                  Player
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Pos
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Level
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Org
                </th>

                {/* Stat columns - dynamic based on category */}
                {showStatcastNA ? (
                  <th
                    colSpan={7}
                    className="px-4 py-3 text-center text-xs font-medium text-gray-400 dark:text-gray-500 italic"
                  >
                    Statcast data not available
                  </th>
                ) : (
                  statColumns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))
                )}

                {/* Actions column */}
                <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">

                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {players.map(({ teamPlayer, player, stats, level, isTotal }, index) => {
                // Check if this is the first row for this player (for multi-level display)
                const isFirstRowForPlayer = index === 0 || players[index - 1]?.teamPlayer.id !== teamPlayer.id;
                // Check if next row is for same player (to avoid divider)
                const hasNextRowSamePlayer = index < players.length - 1 && players[index + 1]?.teamPlayer.id === teamPlayer.id;
                // Display level from row data, or fall back to player.level
                const displayLevel = level || player?.level || '--';

                return (
                  <tr
                    key={`${teamPlayer.id}-${level || 'single'}`}
                    className={`
                      hover:bg-gray-50 dark:hover:bg-gray-800
                      ${isTotal ? 'bg-gray-50 dark:bg-gray-800/50 font-medium' : ''}
                      ${hasNextRowSamePlayer ? 'border-b-0' : ''}
                    `}
                  >
                    {/* Fixed columns */}
                    <td className={`px-4 py-2 whitespace-nowrap sticky left-0 z-10 ${isTotal ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900'}`}>
                      {isFirstRowForPlayer ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => player && onPlayerClick?.(player)}
                            disabled={!player}
                            className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm text-left hover:underline disabled:text-gray-900 disabled:dark:text-white disabled:no-underline disabled:cursor-default"
                          >
                            {player?.name || 'Unknown'}
                          </button>
                          {player?.hasStatcast && (
                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded">
                              SC
                            </span>
                          )}
                          {!stats && !isTotal && (
                            <span
                              className="text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1.5 py-0.5 rounded"
                              title="Stats will be available in the next scheduled update"
                            >
                              Pending
                            </span>
                          )}
                        </div>
                      ) : (
                        // Empty cell for continuation rows
                        <span className="text-sm text-gray-400 dark:text-gray-500 pl-2">↳</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap text-sm ${isTotal ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                      {isFirstRowForPlayer ? (player?.position || '--') : ''}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap text-sm ${isTotal ? 'text-gray-700 dark:text-gray-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                      {displayLevel}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap text-sm ${isTotal ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
                      {isFirstRowForPlayer ? (player?.org || '--') : ''}
                    </td>

                    {/* Stat columns */}
                    {showStatcastNA ? (
                      <td colSpan={7} className="px-4 py-2 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                        N/A
                      </td>
                    ) : (
                      statColumns.map((col) => {
                        const value = stats?.[col.key as keyof typeof stats] as number | undefined;
                        // For Statcast, show N/A if the player doesn't have Statcast data
                        const showNA =
                          activeCategory === 'statcast' &&
                          !player?.hasStatcast &&
                          col.key !== 'PA' &&
                          col.key !== 'IP';

                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2 whitespace-nowrap text-sm text-right ${isTotal ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-900 dark:text-white'}`}
                          >
                            {showNA ? (
                              <span className="text-gray-400 dark:text-gray-500 italic">N/A</span>
                            ) : (
                              formatStatValue(value, col.format)
                            )}
                          </td>
                        );
                      })
                    )}

                    {/* Actions */}
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      {isFirstRowForPlayer && (
                        <button
                          onClick={() => onRemovePlayer(teamPlayer.id!, player?.name || 'this player')}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-xs font-medium"
                          title="Remove player from team"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
