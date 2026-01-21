// components/StatsTable.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import { PlayerStatsTable } from './PlayerStatsTable';
import type { PlayersRegistry, StatsFile, BattingStats, PitchingStats, Player, PlayerIndex } from '../types';
import { getPlayerId } from '../types';
import {
  calculateStatsForSplit,
  createDateRange,
  calculateStatsForDateRange,
  type PresetSplit,
} from '../utils/statsCalculator';

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

async function fetchStats(): Promise<StatsFile> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const year = new Date().getFullYear();
  // Try current year first, fall back to previous year
  let response = await fetch(`${basePath}/data/stats/${year}.json`);
  if (!response.ok) {
    response = await fetch(`${basePath}/data/stats/${year - 1}.json`);
  }
  if (!response.ok) {
    // Return empty stats if not found
    return {};
  }
  return response.json();
}

async function fetchLastSeasonStats(): Promise<StatsFile> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const lastYear = new Date().getFullYear() - 1;
  const response = await fetch(`${basePath}/data/stats/${lastYear}.json`);
  if (!response.ok) {
    // Return empty stats if not found
    return {};
  }
  return response.json();
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

  // Fetch stats
  const {
    data: statsData,
    isLoading: statsLoading,
  } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  });

  // Fetch last season stats
  const {
    data: lastSeasonStats,
    isLoading: lastSeasonLoading,
  } = useQuery({
    queryKey: ['lastSeasonStats'],
    queryFn: fetchLastSeasonStats,
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
  const batters: {
    teamPlayer: typeof teamPlayers[0];
    player: NonNullable<typeof playersRegistry>['players'][0] | undefined;
    stats: BattingStats | PitchingStats | undefined;
  }[] = [];

  const pitchers: {
    teamPlayer: typeof teamPlayers[0];
    player: NonNullable<typeof playersRegistry>['players'][0] | undefined;
    stats: BattingStats | PitchingStats | undefined;
  }[] = [];

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

    // Get stats based on active split and player type
    let stats: BattingStats | PitchingStats | undefined;

    if (isBatter || (!isPitcher && !typeSource)) {
      // Batter stats
      if (activeSplit === 'season' || activeSplit === 'lastSeason') {
        stats = playerStats?.batting;
      } else if (activeSplit === 'custom' && customDateRange) {
        // Custom date range - calculate from game logs
        const range = createDateRange(customDateRange.start, customDateRange.end);
        if (range) {
          stats = calculateStatsForDateRange(playerStats?.battingGameLog, range, 'batting');
        }
      } else {
        // Preset splits (yesterday, today, last7, etc.) - calculate from game logs
        stats = calculateStatsForSplit(playerStats?.battingGameLog, activeSplit as PresetSplit, 'batting');
      }
    } else {
      // Pitcher stats
      if (activeSplit === 'season' || activeSplit === 'lastSeason') {
        stats = playerStats?.pitching;
      } else if (activeSplit === 'custom' && customDateRange) {
        // Custom date range - calculate from game logs
        const range = createDateRange(customDateRange.start, customDateRange.end);
        if (range) {
          stats = calculateStatsForDateRange(playerStats?.pitchingGameLog, range, 'pitching');
        }
      } else {
        // Preset splits (yesterday, today, last7, etc.) - calculate from game logs
        stats = calculateStatsForSplit(playerStats?.pitchingGameLog, activeSplit as PresetSplit, 'pitching');
      }
    }

    const row = { teamPlayer: tp, player, stats };

    if (isPitcher && !isBatter) {
      pitchers.push(row);
    } else {
      // Default to batter if type is not specified or is two-way
      batters.push(row);
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
