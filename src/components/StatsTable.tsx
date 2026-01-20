// components/StatsTable.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import { PlayerStatsTable } from './PlayerStatsTable';
import type { PlayersRegistry, StatsFile, BattingStats, PitchingStats, Player } from '../types';
import { getPlayerId } from '../types';

async function fetchPlayers(): Promise<PlayersRegistry> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/players.json`);
  if (!response.ok) throw new Error('Failed to fetch players');
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
  if (!response.ok) throw new Error('Failed to fetch stats');
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

  // Fetch player registry
  const {
    data: playersRegistry,
    isLoading: playersLoading,
    isError: playersError,
    refetch: refetchPlayers
  } = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
  });

  // Fetch stats
  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats
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

  // Loading state
  if (playersLoading || statsLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Loading stats...</p>
      </div>
    );
  }

  // Error state
  if (playersError || statsError) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-red-600 dark:text-red-400 font-medium mb-2">
          Failed to load data
        </p>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
          {playersError ? 'Could not load player registry.' : 'Could not load stats data.'}
        </p>
        <button
          onClick={() => {
            if (playersError) refetchPlayers();
            if (statsError) refetchStats();
          }}
          className="btn-primary"
        >
          Try Again
        </button>
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
    // Find player by ID (supports both mlbId and legacy fangraphsId)
    const player = playersRegistry?.players.find((p) => getPlayerId(p) === tp.playerId);
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
