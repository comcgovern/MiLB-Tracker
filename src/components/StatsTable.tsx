// components/StatsTable.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import { PlayerStatsTable } from './PlayerStatsTable';
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
    const player = playersRegistry?.players.find((p) => p.fangraphsId === tp.playerId);
    const playerStats = statsData?.[tp.playerId];

    // Get stats based on active split
    let stats: BattingStats | PitchingStats | undefined;
    if (activeSplit === 'season') {
      stats = playerStats?.season;
    } else if (
      activeSplit === 'yesterday' ||
      activeSplit === 'today' ||
      activeSplit === 'last7' ||
      activeSplit === 'last14' ||
      activeSplit === 'last30'
    ) {
      stats = playerStats?.splits?.[activeSplit];
    }

    const row = { teamPlayer: tp, player, stats };

    if (playerStats?.type === 'pitcher') {
      pitchers.push(row);
    } else {
      // Default to batter if type is not specified
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
        />
      )}

      {pitchers.length > 0 && (
        <PlayerStatsTable
          title="Pitchers"
          type="pitcher"
          players={pitchers}
          onRemovePlayer={handleRemovePlayer}
        />
      )}
    </div>
  );
}
