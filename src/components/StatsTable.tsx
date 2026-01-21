// components/StatsTable.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import { PlayerStatsTable } from './PlayerStatsTable';
import type { PlayersRegistry, StatsFile, BattingStats, PitchingStats, Player, PlayerIndex } from '../types';
import { getPlayerId } from '../types';

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

export function StatsTable() {
  const { activeTeamId, activeSplit, openGameLog } = useUIStore();
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

  const handleRemovePlayer = async (teamPlayerId: string, playerName: string) => {
    if (confirm(`Remove ${playerName} from this team?`)) {
      await removePlayerFromTeam(teamPlayerId);
    }
  };

  const handlePlayerClick = (player: Player) => {
    openGameLog(player);
  };

  // Helper to find player info from registry or index
  const findPlayerInfo = (playerId: string): Player | undefined => {
    // First try registry (has stats)
    const registryPlayer = playersRegistry?.players.find((p) => getPlayerId(p) === playerId);
    if (registryPlayer) return registryPlayer;

    // Fall back to player index
    const indexPlayer = playerIndex?.players.find((p) => getPlayerId(p) === playerId);
    if (indexPlayer) {
      // Convert IndexedPlayer to Player format
      return {
        mlbId: indexPlayer.mlbId,
        name: indexPlayer.name,
        team: indexPlayer.team,
        org: indexPlayer.org,
        level: indexPlayer.level as Player['level'],
        position: indexPlayer.position,
        hasStatcast: false,
      };
    }

    return undefined;
  };

  // Loading state
  if (playersLoading || statsLoading || indexLoading) {
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
    const player = findPlayerInfo(tp.playerId);
    const playerStats = statsData?.[tp.playerId];

    // Determine if batter or pitcher based on stats data
    const isBatter = playerStats?.type === 'batter' || !!playerStats?.batting;
    const isPitcher = playerStats?.type === 'pitcher' || !!playerStats?.pitching;

    // Get stats based on active split and player type
    let stats: BattingStats | PitchingStats | undefined;

    if (isBatter || (!isPitcher && !playerStats)) {
      // Batter stats
      if (activeSplit === 'season') {
        stats = playerStats?.batting;
      } else if (
        activeSplit === 'yesterday' ||
        activeSplit === 'today' ||
        activeSplit === 'last7' ||
        activeSplit === 'last14' ||
        activeSplit === 'last30'
      ) {
        stats = playerStats?.battingSplits?.[activeSplit];
      }
    } else {
      // Pitcher stats
      if (activeSplit === 'season') {
        stats = playerStats?.pitching;
      } else if (
        activeSplit === 'yesterday' ||
        activeSplit === 'today' ||
        activeSplit === 'last7' ||
        activeSplit === 'last14' ||
        activeSplit === 'last30'
      ) {
        stats = playerStats?.pitchingSplits?.[activeSplit];
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
