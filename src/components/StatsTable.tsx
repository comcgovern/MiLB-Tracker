// components/StatsTable.tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers, type SortOption } from '../hooks/useTeamPlayers';
import { PlayerStatsTable } from './PlayerStatsTable';
import type { StatsFile, BattingStats, PitchingStats, Player, PlayerIndex, PlayerStatsData } from '../types';
import { getPlayerId } from '../types';
import {
  calculateStatsForSplit,
  createDateRange,
  calculateStatsForDateRange,
  calculateStatsForLevelAndSplit,
  calculateStatsForLevelAndDateRange,
  getLevelsFromGameLogs,
  filterGameLogsBySituationalSplit,
  LEVEL_ORDER,
  type PresetSplit,
} from '../utils/statsCalculator';
import {
  fetchCurrentSeasonStats,
  fetchSeasonStats,
} from '../utils/statsService';
import { exportToCSV, downloadCSV, generateExportFilename } from '../utils/csvExport';
import type { MiLBLevel, StatsByLevel, PlayersRegistry } from '../types';

async function fetchPlayers(): Promise<PlayersRegistry> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/players.json`);
  if (!response.ok) {
    // Return empty registry if not found
    return { players: [], lastUpdated: '' };
  }
  return response.json();
}

async function fetchPlayerIndex(): Promise<PlayerIndex> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/player-index.json`);
  if (!response.ok) {
    // Return empty index if not found
    return { players: [], year: new Date().getFullYear(), lastUpdated: '', count: 0 };
  }
  return response.json();
}

// Fetch stats using the new monthly file service
async function fetchStats(): Promise<{ stats: StatsFile; year: number }> {
  return fetchCurrentSeasonStats();
}

// Fetch last season stats using the new monthly file service
async function fetchLastSeasonStats(currentYear: number): Promise<StatsFile> {
  const lastYear = currentYear - 1;
  return fetchSeasonStats(lastYear);
}

export function StatsTable() {
  const { activeTeamId, activeSplit, activeSituationalSplit, customDateRange, openGameLog, openConfirmModal } = useUIStore();
  const { removePlayerFromTeam, reorderPlayers, sortPlayers } = useTeamPlayers(activeTeamId);
  const [batterSortOption, setBatterSortOption] = useState<SortOption>('custom');
  const [pitcherSortOption, setPitcherSortOption] = useState<SortOption>('custom');

  // Fetch team players from IndexedDB
  const teamPlayers = useLiveQuery(
    () => activeTeamId ? db.teamPlayers.where('teamId').equals(activeTeamId).toArray() : [],
    [activeTeamId]
  );

  // Fetch player registry (for players with stats)
  const {
    data: playersRegistry,
    isLoading: playersLoading,
  } = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
  });

  // Fetch player index (for all MiLB players - fallback for player info)
  const {
    data: playerIndex,
    isLoading: indexLoading,
  } = useQuery({
    queryKey: ['player-index'],
    queryFn: fetchPlayerIndex,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Fetch stats (uses monthly file service)
  const {
    data: statsResult,
    isLoading: statsLoading,
  } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  const statsData = statsResult?.stats;
  const currentSeasonYear = statsResult?.year ?? new Date().getFullYear();

  // Fetch last season stats (uses monthly file service)
  const {
    data: lastSeasonStats,
    isLoading: lastSeasonLoading,
  } = useQuery({
    queryKey: ['lastSeasonStats', currentSeasonYear],
    queryFn: () => fetchLastSeasonStats(currentSeasonYear),
    enabled: activeSplit === 'lastSeason', // Only fetch when needed
  });

  // Fetch team info for export
  const activeTeam = useLiveQuery(
    () => activeTeamId ? db.teams.get(activeTeamId) : undefined,
    [activeTeamId]
  );

  // Get split label for export filename
  const getSplitLabel = (): string => {
    switch (activeSplit) {
      case 'yesterday': return 'Yesterday';
      case 'today': return 'Today';
      case 'last7': return 'Last 7 Days';
      case 'last14': return 'Last 14 Days';
      case 'last30': return 'Last 30 Days';
      case 'season': return 'Season';
      case 'lastSeason': return 'Last Season';
      case 'custom': return customDateRange ? `${customDateRange.start} to ${customDateRange.end}` : 'Custom';
      default: return '';
    }
  };

  const handleRemovePlayer = (teamPlayerId: string, playerName: string) => {
    openConfirmModal({
      title: 'Remove Player',
      message: `Remove ${playerName} from this team?`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        await removePlayerFromTeam(teamPlayerId);
      },
    });
  };

  const handlePlayerClick = (player: Player) => {
    openGameLog(player);
  };

  // Handle reorder from drag-and-drop
  const handleReorderPlayers = async (orderedPlayerIds: string[]) => {
    await reorderPlayers(orderedPlayerIds);
    // Reset sort options since we're now in custom order
    setBatterSortOption('custom');
    setPitcherSortOption('custom');
  };

  // Build player info map for sorting (name and level)
  const buildPlayerInfoMap = (
    rows: { teamPlayer: { playerId: string }; player: { name: string; level?: string } | undefined }[]
  ): Map<string, { name: string; level: string }> => {
    const map = new Map<string, { name: string; level: string }>();
    rows.forEach(({ teamPlayer, player }) => {
      if (!map.has(teamPlayer.playerId) && player) {
        map.set(teamPlayer.playerId, {
          name: player.name,
          level: player.level || '',
        });
      }
    });
    return map;
  };

  // Handle sort option change for batters
  const handleBatterSort = async (option: SortOption) => {
    setBatterSortOption(option);
    if (option !== 'custom') {
      const playerInfoMap = buildPlayerInfoMap(batters);
      await sortPlayers(option, playerInfoMap);
    }
  };

  // Handle sort option change for pitchers
  const handlePitcherSort = async (option: SortOption) => {
    setPitcherSortOption(option);
    if (option !== 'custom') {
      const playerInfoMap = buildPlayerInfoMap(pitchers);
      await sortPlayers(option, playerInfoMap);
    }
  };

  // Helper to determine if a player level has Statcast coverage
  // We now calculate batted ball stats (GB%, FB%, LD%, etc.) from PBP for all levels
  // True Statcast metrics (EV, LA, Barrel%) are only available at AAA
  const levelHasStatcast = (_level: string | undefined): boolean => {
    return true; // Enable for all levels - batted ball stats available from PBP
  };

  // Helper to find player info from registry or index
  // Returns player info and type (from index if available)
  const findPlayerInfo = (playerId: string): { player: Player | undefined; indexType?: 'batter' | 'pitcher' } => {
    // First try registry (has stats)
    const registryPlayer = playersRegistry?.players.find((p) => getPlayerId(p) === playerId);

    // Also check index for type info
    const indexPlayer = playerIndex?.players.find((p) => getPlayerId(p) === playerId);

    if (registryPlayer) {
      // Update hasStatcast based on level if not already set
      const playerWithStatcast = {
        ...registryPlayer,
        hasStatcast: registryPlayer.hasStatcast || levelHasStatcast(registryPlayer.level),
      };
      return { player: playerWithStatcast, indexType: indexPlayer?.type };
    }

    // Fall back to player index
    if (indexPlayer) {
      // Convert IndexedPlayer to Player format
      // Enable Statcast for AAA players (all AAA games have Statcast since 2023)
      return {
        player: {
          mlbId: indexPlayer.mlbId,
          name: indexPlayer.name,
          team: indexPlayer.team,
          org: indexPlayer.org,
          level: indexPlayer.level as Player['level'],
          position: indexPlayer.position,
          hasStatcast: levelHasStatcast(indexPlayer.level),
        },
        indexType: indexPlayer.type,
      };
    }

    return { player: undefined };
  };

  // Loading state
  const isLoadingLastSeason = activeSplit === 'lastSeason' && lastSeasonLoading;
  if (playersLoading || statsLoading || indexLoading || isLoadingLastSeason) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Loading stats...</p>
      </div>
    );
  }

  if (!teamPlayers || teamPlayers.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No players added yet. Click "Add Player" to get started.
        </p>
      </div>
    );
  }

  // Build player rows with their stats and separate into batters and pitchers
  // Each player may have multiple rows (one per level + a MiLB total row)
  interface PlayerRowWithLevel {
    teamPlayer: typeof teamPlayers[0];
    player: NonNullable<typeof playersRegistry>['players'][0] | undefined;
    stats: BattingStats | PitchingStats | undefined;
    level?: MiLBLevel;  // undefined means it's a single-level player
    isTotal?: boolean;  // true for the MiLB total row
  }

  const batters: PlayerRowWithLevel[] = [];
  const pitchers: PlayerRowWithLevel[] = [];

  // Helper to get filtered game logs with situational split applied
  const getFilteredGameLogs = (
    gameLogs: import('../types').GameLogEntry[] | undefined
  ): import('../types').GameLogEntry[] | undefined => {
    if (!gameLogs || activeSituationalSplit === 'all') return gameLogs;
    const filtered = filterGameLogsBySituationalSplit(gameLogs, activeSituationalSplit);
    return filtered.length > 0 ? filtered : undefined;
  };

  // Helper to get stats by level for a player
  const getStatsByLevel = (
    playerStats: PlayerStatsData | undefined,
    type: 'batting' | 'pitching'
  ): { levels: MiLBLevel[], statsByLevel: StatsByLevel<BattingStats | PitchingStats> } => {
    if (!playerStats) return { levels: [], statsByLevel: {} };

    const byLevel = type === 'batting' ? playerStats.battingByLevel : playerStats.pitchingByLevel;
    const rawGameLogs = type === 'batting' ? playerStats.battingGameLog : playerStats.pitchingGameLog;
    const gameLogs = getFilteredGameLogs(rawGameLogs);

    // When a situational split is active, we must use game logs (can't use pre-computed stats)
    if (activeSituationalSplit !== 'all') {
      if (gameLogs) {
        const levels = getLevelsFromGameLogs(gameLogs).filter(l => l !== 'MiLB');
        return { levels, statsByLevel: {} };
      }
      return { levels: [], statsByLevel: {} };
    }

    if (byLevel && Object.keys(byLevel).length > 0) {
      // Use pre-computed level stats for season/lastSeason
      const levels = LEVEL_ORDER.filter(l => l in byLevel && l !== 'MiLB') as MiLBLevel[];
      return { levels, statsByLevel: byLevel as StatsByLevel<BattingStats | PitchingStats> };
    } else if (gameLogs) {
      // For time-based splits, get levels from game logs
      const levels = getLevelsFromGameLogs(gameLogs).filter(l => l !== 'MiLB');
      return { levels, statsByLevel: {} };
    }

    return { levels: [], statsByLevel: {} };
  };

  // Helper to get stats for a specific level
  const getStatsForLevel = (
    playerStats: PlayerStatsData | undefined,
    level: MiLBLevel,
    type: 'batting' | 'pitching'
  ): BattingStats | PitchingStats | undefined => {
    if (!playerStats) return undefined;

    const rawGameLogs = type === 'batting' ? playerStats.battingGameLog : playerStats.pitchingGameLog;
    const gameLogs = getFilteredGameLogs(rawGameLogs);
    const byLevel = type === 'batting' ? playerStats.battingByLevel : playerStats.pitchingByLevel;

    // When a situational split is active, we must calculate from filtered game logs
    if (activeSituationalSplit !== 'all') {
      return calculateStatsForLevelAndSplit(gameLogs, level, 'season' as PresetSplit, type);
    }

    if (activeSplit === 'season' || activeSplit === 'lastSeason') {
      // Use pre-computed level stats
      return byLevel?.[level];
    } else if (activeSplit === 'custom' && customDateRange) {
      // Custom date range - calculate from game logs filtered by level
      const range = createDateRange(customDateRange.start, customDateRange.end);
      if (range) {
        return calculateStatsForLevelAndDateRange(gameLogs, level, range, type);
      }
    } else {
      // Preset splits - calculate from game logs filtered by level
      return calculateStatsForLevelAndSplit(gameLogs, level, activeSplit as PresetSplit, type);
    }
    return undefined;
  };

  teamPlayers.forEach((tp) => {
    // Find player by ID from registry or index
    const { player, indexType } = findPlayerInfo(tp.playerId);

    // Use last season stats if that split is selected, otherwise use current season
    const currentPlayerStats = statsData?.[tp.playerId];
    const lastSeasonPlayerStats = lastSeasonStats?.[tp.playerId];
    const playerStats = activeSplit === 'lastSeason' ? lastSeasonPlayerStats : currentPlayerStats;

    // For determining player type, prefer current stats, then fall back to last season
    const typeSource = currentPlayerStats || lastSeasonPlayerStats;

    // Determine if batter or pitcher based on stats data, then fall back to index type
    const isBatterFromStats = typeSource?.type === 'batter' || !!typeSource?.batting;
    const isPitcherFromStats = typeSource?.type === 'pitcher' || !!typeSource?.pitching;

    // Use index type as fallback when no stats available
    const isPitcher = isPitcherFromStats || (!typeSource && indexType === 'pitcher');
    const isBatter = isBatterFromStats || (!typeSource && indexType === 'batter');

    // Determine the player type for stats retrieval
    const statType: 'batting' | 'pitching' = (isPitcher && !isBatter) ? 'pitching' : 'batting';

    // Get available levels for this player
    const { levels } = getStatsByLevel(playerStats, statType);

    // Check if player has multiple levels
    const hasMultipleLevels = levels.length > 1;

    if (hasMultipleLevels) {
      // Create a row for each level
      for (const level of levels) {
        const levelStats = getStatsForLevel(playerStats, level, statType);
        const row: PlayerRowWithLevel = {
          teamPlayer: tp,
          player,
          stats: levelStats,
          level,
          isTotal: false,
        };

        if (isPitcher && !isBatter) {
          pitchers.push(row);
        } else {
          batters.push(row);
        }
      }

      // Add a MiLB total row
      let totalStats: BattingStats | PitchingStats | undefined;
      const rawTotalGameLogs = statType === 'batting' ? playerStats?.battingGameLog : playerStats?.pitchingGameLog;
      const totalGameLogs = getFilteredGameLogs(rawTotalGameLogs);

      // When a situational split is active, always calculate from filtered game logs
      if (activeSituationalSplit !== 'all') {
        totalStats = calculateStatsForSplit(totalGameLogs, 'season' as PresetSplit, statType);
      } else if (activeSplit === 'season' || activeSplit === 'lastSeason') {
        totalStats = statType === 'batting' ? playerStats?.batting : playerStats?.pitching;
      } else if (activeSplit === 'custom' && customDateRange) {
        const range = createDateRange(customDateRange.start, customDateRange.end);
        if (range) {
          totalStats = calculateStatsForDateRange(totalGameLogs, range, statType);
        }
      } else {
        totalStats = calculateStatsForSplit(totalGameLogs, activeSplit as PresetSplit, statType);
      }

      const totalRow: PlayerRowWithLevel = {
        teamPlayer: tp,
        player,
        stats: totalStats,
        level: 'MiLB',
        isTotal: true,
      };

      if (isPitcher && !isBatter) {
        pitchers.push(totalRow);
      } else {
        batters.push(totalRow);
      }
    } else {
      // Single level or no level info - just one row
      let stats: BattingStats | PitchingStats | undefined;
      const rawSingleGameLogs = statType === 'batting' ? playerStats?.battingGameLog : playerStats?.pitchingGameLog;
      const singleGameLogs = getFilteredGameLogs(rawSingleGameLogs);

      // When a situational split is active, always calculate from filtered game logs
      if (activeSituationalSplit !== 'all') {
        stats = calculateStatsForSplit(singleGameLogs, 'season' as PresetSplit, statType);
      } else if (activeSplit === 'season' || activeSplit === 'lastSeason') {
        stats = statType === 'batting' ? playerStats?.batting : playerStats?.pitching;
      } else if (activeSplit === 'custom' && customDateRange) {
        const range = createDateRange(customDateRange.start, customDateRange.end);
        if (range) {
          stats = calculateStatsForDateRange(singleGameLogs, range, statType);
        }
      } else {
        stats = calculateStatsForSplit(singleGameLogs, activeSplit as PresetSplit, statType);
      }

      // For single level, use the player's current level from player info
      // or the first (only) level from stats
      const displayLevel = levels.length === 1 ? levels[0] : undefined;

      const row: PlayerRowWithLevel = {
        teamPlayer: tp,
        player,
        stats,
        level: displayLevel,
        isTotal: false,
      };

      if (isPitcher && !isBatter) {
        pitchers.push(row);
      } else {
        batters.push(row);
      }
    }
  });

  // Handle CSV export
  const handleExport = () => {
    const csvContent = exportToCSV({
      batters: batters.map(b => ({
        player: b.player,
        stats: b.stats,
        level: b.level,
        isTotal: b.isTotal,
      })),
      pitchers: pitchers.map(p => ({
        player: p.player,
        stats: p.stats,
        level: p.level,
        isTotal: p.isTotal,
      })),
      teamName: activeTeam?.name,
      splitLabel: getSplitLabel(),
    });

    const filename = generateExportFilename(activeTeam?.name, getSplitLabel());
    downloadCSV(csvContent, filename);
  };

  return (
    <div className="p-4">
      {/* Export button */}
      {(batters.length > 0 || pitchers.length > 0) && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleExport}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
        </div>
      )}

      {batters.length > 0 && (
        <PlayerStatsTable
          title="Batters"
          type="batter"
          players={batters}
          onRemovePlayer={handleRemovePlayer}
          onPlayerClick={handlePlayerClick}
          onReorderPlayers={handleReorderPlayers}
          onSortPlayers={handleBatterSort}
          currentSortOption={batterSortOption}
        />
      )}

      {pitchers.length > 0 && (
        <PlayerStatsTable
          title="Pitchers"
          type="pitcher"
          players={pitchers}
          onRemovePlayer={handleRemovePlayer}
          onPlayerClick={handlePlayerClick}
          onReorderPlayers={handleReorderPlayers}
          onSortPlayers={handlePitcherSort}
          currentSortOption={pitcherSortOption}
        />
      )}
    </div>
  );
}
