// components/StatsTable.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import { PlayerStatsTable } from './PlayerStatsTable';
import type { PlayersRegistry, StatsFile, BattingStats, PitchingStats, Player, PlayerIndex, PlayerStatsData } from '../types';
import { getPlayerId } from '../types';
import {
  calculateStatsForSplit,
  createDateRange,
  calculateStatsForDateRange,
  calculateStatsForLevelAndSplit,
  calculateStatsForLevelAndDateRange,
  getLevelsFromGameLogs,
  LEVEL_ORDER,
  type PresetSplit,
} from '../utils/statsCalculator';
import {
  fetchCurrentSeasonStats,
  fetchSeasonStats,
} from '../utils/statsService';
import type { MiLBLevel, StatsByLevel } from '../types';

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
  const { activeTeamId, activeSplit, customDateRange, openGameLog } = useUIStore();
  const { removePlayerFromTeam } = useTeamPlayers(activeTeamId);

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

  const handleRemovePlayer = async (teamPlayerId: string, playerName: string) => {
    if (confirm(`Remove ${playerName} from this team?`)) {
      await removePlayerFromTeam(teamPlayerId);
    }
  };

  const handlePlayerClick = (player: Player) => {
    openGameLog(player);
  };

  // Helper to find player info from registry or index
  // Returns player info and type (from index if available)
  const findPlayerInfo = (playerId: string): { player: Player | undefined; indexType?: 'batter' | 'pitcher' } => {
    // First try registry (has stats)
    const registryPlayer = playersRegistry?.players.find((p) => getPlayerId(p) === playerId);

    // Also check index for type info
    const indexPlayer = playerIndex?.players.find((p) => getPlayerId(p) === playerId);

    if (registryPlayer) {
      return { player: registryPlayer, indexType: indexPlayer?.type };
    }

    // Fall back to player index
    if (indexPlayer) {
      // Convert IndexedPlayer to Player format
      return {
        player: {
          mlbId: indexPlayer.mlbId,
          name: indexPlayer.name,
          team: indexPlayer.team,
          org: indexPlayer.org,
          level: indexPlayer.level as Player['level'],
          position: indexPlayer.position,
          hasStatcast: false,
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

  // Helper to get stats by level for a player
  const getStatsByLevel = (
    playerStats: PlayerStatsData | undefined,
    type: 'batting' | 'pitching'
  ): { levels: MiLBLevel[], statsByLevel: StatsByLevel<BattingStats | PitchingStats> } => {
    if (!playerStats) return { levels: [], statsByLevel: {} };

    const byLevel = type === 'batting' ? playerStats.battingByLevel : playerStats.pitchingByLevel;
    const gameLogs = type === 'batting' ? playerStats.battingGameLog : playerStats.pitchingGameLog;

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

    const gameLogs = type === 'batting' ? playerStats.battingGameLog : playerStats.pitchingGameLog;
    const byLevel = type === 'batting' ? playerStats.battingByLevel : playerStats.pitchingByLevel;

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
      if (activeSplit === 'season' || activeSplit === 'lastSeason') {
        totalStats = statType === 'batting' ? playerStats?.batting : playerStats?.pitching;
      } else if (activeSplit === 'custom' && customDateRange) {
        const range = createDateRange(customDateRange.start, customDateRange.end);
        const gameLogs = statType === 'batting' ? playerStats?.battingGameLog : playerStats?.pitchingGameLog;
        if (range) {
          totalStats = calculateStatsForDateRange(gameLogs, range, statType);
        }
      } else {
        const gameLogs = statType === 'batting' ? playerStats?.battingGameLog : playerStats?.pitchingGameLog;
        totalStats = calculateStatsForSplit(gameLogs, activeSplit as PresetSplit, statType);
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

      if (statType === 'batting') {
        if (activeSplit === 'season' || activeSplit === 'lastSeason') {
          stats = playerStats?.batting;
        } else if (activeSplit === 'custom' && customDateRange) {
          const range = createDateRange(customDateRange.start, customDateRange.end);
          if (range) {
            stats = calculateStatsForDateRange(playerStats?.battingGameLog, range, 'batting');
          }
        } else {
          stats = calculateStatsForSplit(playerStats?.battingGameLog, activeSplit as PresetSplit, 'batting');
        }
      } else {
        if (activeSplit === 'season' || activeSplit === 'lastSeason') {
          stats = playerStats?.pitching;
        } else if (activeSplit === 'custom' && customDateRange) {
          const range = createDateRange(customDateRange.start, customDateRange.end);
          if (range) {
            stats = calculateStatsForDateRange(playerStats?.pitchingGameLog, range, 'pitching');
          }
        } else {
          stats = calculateStatsForSplit(playerStats?.pitchingGameLog, activeSplit as PresetSplit, 'pitching');
        }
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

  return (
    <div className="p-4">
      {batters.length > 0 && (
        <PlayerStatsTable
          title="Batters"
          type="batter"
          players={batters}
          onRemovePlayer={handleRemovePlayer}
          onPlayerClick={handlePlayerClick}
        />
      )}

      {pitchers.length > 0 && (
        <PlayerStatsTable
          title="Pitchers"
          type="pitcher"
          players={pitchers}
          onRemovePlayer={handleRemovePlayer}
          onPlayerClick={handlePlayerClick}
        />
      )}
    </div>
  );
}
