// components/PlayerStatsTable.tsx
import { useState, useRef } from 'react';
import { StatCategoryToggle } from './StatCategoryToggle';
import { ArsenalTable } from './ArsenalTable';
import {
  type StatCategory,
  type StatColumn,
  BATTING_STATS,
  PITCHING_STATS,
  formatStatValue,
} from '../config/statCategories';
import type { Player, BattingStats, PitchingStats, MiLBLevel, PlayerStatsData } from '../types';
import type { DBTeamPlayer } from '../db';
import type { SortOption } from '../hooks/useTeamPlayers';
import { usePercentiles } from '../hooks/usePercentiles';
import { getPercentile, getPercentileColor } from '../utils/percentileCalculator';

export type StatsViewMode = 'standard' | 'percentile' | 'vsL' | 'vsR';

interface PlayerRow {
  teamPlayer: DBTeamPlayer;
  player: Player | undefined;
  stats: BattingStats | PitchingStats | undefined;
  statcast?: PlayerStatsData['statcast'];  // Statcast data for this player
  level?: MiLBLevel;  // The level for this row (undefined = use player.level)
  isTotal?: boolean;  // true for MiLB total rows
  playerStatsData?: PlayerStatsData;  // Full player stats data (for splits access)
}

interface PlayerStatsTableProps {
  title: string;
  type: 'batter' | 'pitcher';
  players: PlayerRow[];
  onRemovePlayer: (teamPlayerId: string, playerName: string) => void;
  onPlayerClick?: (player: Player) => void;
  onReorderPlayers?: (orderedTeamPlayerIds: string[]) => void;
  onSortPlayers?: (sortOption: SortOption) => void;
  currentSortOption?: SortOption;
}

export function PlayerStatsTable({
  title,
  type,
  players,
  onRemovePlayer,
  onPlayerClick,
  onReorderPlayers,
  onSortPlayers,
  currentSortOption = 'custom',
}: PlayerStatsTableProps) {
  const [activeCategory, setActiveCategory] = useState<StatCategory>('standard');
  const [viewMode, setViewMode] = useState<StatsViewMode>('standard');
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [dragOverPlayerId, setDragOverPlayerId] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const { percentiles } = usePercentiles();

  // Check if any player in this table has Statcast data
  const anyHasStatcast = players.some((p) => p.player?.hasStatcast);

  // Check if any pitcher has arsenal data
  const anyHasArsenal = type === 'pitcher' && players.some((p) => p.statcast?.pit?.arsenal);

  // Get the stat columns for the current category and player type
  const statColumns: StatColumn[] =
    type === 'batter' ? BATTING_STATS[activeCategory] : PITCHING_STATS[activeCategory];

  // Keys for stats that come from the Savant statcast block (not PBP-derived)
  const savantBatterKeys = ['BBE', 'EV', 'maxEV', 'EV50', 'EV90', 'LA', 'Barrel%', 'Barrels', 'Hard%', 'Sweet Spot%', 'xBA', 'xSLG', 'xwOBA'];
  const savantPitcherKeys = ['Velo', 'maxVelo', 'SpinRate', 'Extension', 'Whiff%', 'CSW%'];

  // If Statcast is selected but no one has it, show message
  const showStatcastNA = activeCategory === 'statcast' && !anyHasStatcast;

  // Count unique players (not rows, since multi-level players have multiple rows)
  const uniquePlayerCount = new Set(players.map(p => p.teamPlayer.id)).size;

  // Get unique player IDs in order (for drag-and-drop)
  const uniquePlayerIds: string[] = [];
  players.forEach(p => {
    if (p.teamPlayer.id && !uniquePlayerIds.includes(p.teamPlayer.id)) {
      uniquePlayerIds.push(p.teamPlayer.id);
    }
  });

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, teamPlayerId: string) => {
    setDraggedPlayerId(teamPlayerId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', teamPlayerId);
    // Add a class to the dragged element
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add('opacity-50');
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedPlayerId(null);
    setDragOverPlayerId(null);
    dragCounter.current = 0;
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove('opacity-50');
    }
  };

  const handleDragEnter = (e: React.DragEvent, teamPlayerId: string) => {
    e.preventDefault();
    dragCounter.current++;
    if (teamPlayerId !== draggedPlayerId) {
      setDragOverPlayerId(teamPlayerId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverPlayerId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetPlayerId: string) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOverPlayerId(null);

    if (!draggedPlayerId || draggedPlayerId === targetPlayerId) return;

    // Reorder the players
    const newOrder = [...uniquePlayerIds];
    const draggedIndex = newOrder.indexOf(draggedPlayerId);
    const targetIndex = newOrder.indexOf(targetPlayerId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove from current position and insert at new position
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedPlayerId);

    onReorderPlayers?.(newOrder);
    setDraggedPlayerId(null);
  };

  // Sort options
  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'custom', label: 'Custom Order' },
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'level-desc', label: 'Level (High-Low)' },
    { value: 'level-asc', label: 'Level (Low-High)' },
  ];

  if (players.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {title}
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            ({uniquePlayerCount})
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="inline-flex rounded-md shadow-sm" role="group">
            {([
              { value: 'standard' as const, label: 'Stats' },
              { value: 'percentile' as const, label: 'Percentile' },
              { value: 'vsL' as const, label: 'vs L' },
              { value: 'vsR' as const, label: 'vs R' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setViewMode(value)}
                className={`
                  px-2.5 py-1 text-xs font-medium border
                  first:rounded-l-md last:rounded-r-md
                  focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${viewMode === value
                    ? 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-800'
                  }
                `}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Sort dropdown */}
          {onSortPlayers && (
            <select
              value={currentSortOption}
              onChange={(e) => onSortPlayers(e.target.value as SortOption)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
              title="Sort players"
            >
              {sortOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          <StatCategoryToggle
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            hasStatcast={anyHasStatcast}
            hasArsenal={anyHasArsenal}
            playerType={type}
          />
        </div>
      </div>

      {/* Table with horizontal scroll for stats */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {/* Drag handle column */}
                {onReorderPlayers && (
                  <th className="w-8 px-1 py-3 text-center text-xs font-medium text-gray-400 dark:text-gray-500 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10">
                    <span className="sr-only">Drag</span>
                  </th>
                )}
                {/* Fixed columns */}
                <th className={`px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap ${onReorderPlayers ? 'sticky left-8' : 'sticky left-0'} bg-gray-50 dark:bg-gray-800 z-10`}>
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
                {activeCategory === 'arsenal' ? (
                  <th
                    colSpan={10}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    Pitch Arsenal
                  </th>
                ) : showStatcastNA ? (
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
              {players.map(({ teamPlayer, player, stats, statcast: rowStatcast, level, isTotal, playerStatsData }, index) => {
                // Check if this is the first row for this player (for multi-level display)
                const isFirstRowForPlayer = index === 0 || players[index - 1]?.teamPlayer.id !== teamPlayer.id;
                // Check if next row is for same player (to avoid divider)
                const hasNextRowSamePlayer = index < players.length - 1 && players[index + 1]?.teamPlayer.id === teamPlayer.id;
                // Display level from row data, or fall back to player.level
                const displayLevel = level || player?.level || '--';
                // Check if this row is being dragged over
                const isDragOver = dragOverPlayerId === teamPlayer.id && isFirstRowForPlayer;

                return (
                  <tr
                    key={`${teamPlayer.id}-${level || 'single'}`}
                    draggable={onReorderPlayers && isFirstRowForPlayer}
                    onDragStart={isFirstRowForPlayer ? (e) => handleDragStart(e, teamPlayer.id!) : undefined}
                    onDragEnd={isFirstRowForPlayer ? handleDragEnd : undefined}
                    onDragEnter={isFirstRowForPlayer ? (e) => handleDragEnter(e, teamPlayer.id!) : undefined}
                    onDragLeave={isFirstRowForPlayer ? handleDragLeave : undefined}
                    onDragOver={isFirstRowForPlayer ? handleDragOver : undefined}
                    onDrop={isFirstRowForPlayer ? (e) => handleDrop(e, teamPlayer.id!) : undefined}
                    className={`
                      hover:bg-gray-50 dark:hover:bg-gray-800
                      ${isTotal ? 'bg-gray-50 dark:bg-gray-800/50 font-medium' : ''}
                      ${hasNextRowSamePlayer ? 'border-b-0' : ''}
                      ${isDragOver ? 'bg-primary-50 dark:bg-primary-900/20 border-t-2 border-primary-500' : ''}
                      ${isFirstRowForPlayer && onReorderPlayers ? 'cursor-grab active:cursor-grabbing' : ''}
                    `}
                  >
                    {/* Drag handle */}
                    {onReorderPlayers && (
                      <td className={`w-8 px-1 py-2 text-center sticky left-0 z-10 ${isTotal ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900'} ${isDragOver ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                        {isFirstRowForPlayer && (
                          <span className="text-gray-400 dark:text-gray-500 select-none" title="Drag to reorder">
                            ⋮⋮
                          </span>
                        )}
                      </td>
                    )}
                    {/* Fixed columns */}
                    <td className={`px-4 py-2 whitespace-nowrap ${onReorderPlayers ? 'sticky left-8' : 'sticky left-0'} z-10 ${isTotal ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900'} ${isDragOver ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                      {isFirstRowForPlayer ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => player && onPlayerClick?.(player)}
                            disabled={!player}
                            className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm text-left hover:underline disabled:text-gray-900 disabled:dark:text-white disabled:no-underline disabled:cursor-default"
                          >
                            {player?.name || 'Unknown'}
                          </button>
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
                    {activeCategory === 'arsenal' ? (
                      // Arsenal tab: render inline arsenal table for each pitcher
                      <td colSpan={10} className="px-2 py-1">
                        {isFirstRowForPlayer ? (
                          rowStatcast?.pit?.arsenal ? (
                            <ArsenalTable arsenal={rowStatcast.pit.arsenal} />
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 italic text-sm">No arsenal data available</span>
                          )
                        ) : null}
                      </td>
                    ) : showStatcastNA ? (
                      <td colSpan={7} className="px-4 py-2 text-center text-sm text-gray-400 dark:text-gray-500 italic">
                        N/A
                      </td>
                    ) : (
                      statColumns.map((col) => {
                        // Determine which stats object to use based on view mode
                        const effectiveStats = (() => {
                          if (viewMode === 'vsL' || viewMode === 'vsR') {
                            const splitsKey = viewMode === 'vsL' ? 'vsL' : 'vsR';
                            if (playerStatsData) {
                              const splits = type === 'batter' ? playerStatsData.battingSplits : playerStatsData.pitchingSplits;
                              return (splits as Record<string, any>)?.[splitsKey] as typeof stats;
                            }
                            return undefined;
                          }
                          return stats;
                        })();

                        let value: number | undefined;

                        if (activeCategory === 'statcast' && viewMode !== 'vsL' && viewMode !== 'vsR') {
                          // For the statcast category, pull Savant-specific metrics from
                          // the statcast block, falling back to PBP-derived stats
                          if (type === 'batter' && savantBatterKeys.includes(col.key) && rowStatcast?.bat) {
                            value = rowStatcast.bat[col.key as keyof typeof rowStatcast.bat] as number | undefined;
                          } else if (type === 'pitcher' && savantPitcherKeys.includes(col.key) && rowStatcast?.pit) {
                            value = rowStatcast.pit[col.key as keyof typeof rowStatcast.pit] as number | undefined;
                          } else {
                            value = effectiveStats?.[col.key as keyof typeof effectiveStats] as number | undefined;
                          }
                        } else {
                          value = effectiveStats?.[col.key as keyof typeof effectiveStats] as number | undefined;
                        }

                        // For Statcast Savant-only metrics, show N/A if no statcast data
                        const isSavantKey = type === 'batter'
                          ? savantBatterKeys.includes(col.key)
                          : savantPitcherKeys.includes(col.key);
                        const showNA =
                          activeCategory === 'statcast' &&
                          isSavantKey &&
                          !rowStatcast &&
                          viewMode !== 'vsL' && viewMode !== 'vsR';

                        // Percentile coloring
                        const playerLevel: MiLBLevel = level || player?.level || 'MiLB';
                        const pctile = viewMode === 'percentile' && percentiles && value !== undefined
                          ? getPercentile(percentiles, playerLevel, col.key, value, type === 'batter' ? 'batting' : 'pitching')
                          : undefined;
                        const pctColor = pctile !== undefined
                          ? getPercentileColor(pctile, col.key, type === 'batter' ? 'batting' : 'pitching')
                          : undefined;

                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2 whitespace-nowrap text-sm text-right ${!pctColor ? (isTotal ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-900 dark:text-white') : ''}`}
                            style={pctColor ? { backgroundColor: pctColor.bg, color: pctColor.text } : undefined}
                            title={pctile !== undefined ? `${pctile}th percentile at ${playerLevel}` : undefined}
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
