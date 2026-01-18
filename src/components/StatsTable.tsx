// components/StatsTable.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import { PlayerStatsTable } from './PlayerStatsTable';
import type { PlayersRegistry, StatsFile, BattingStats, PitchingStats } from '../types';
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
    queryKey: ['stats'],
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
