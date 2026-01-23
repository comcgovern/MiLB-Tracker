// hooks/useDashboardData.ts
// Hook to fetch and calculate all dashboard leaderboards

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import type { Player, PlayerStatsData, PlayerIndex } from '../types';
import type { DashboardData } from '../types/dashboard';
import { fetchCurrentSeasonStats } from '../utils/statsService';
import {
  getYesterdayDate,
  calculateHomeRuns,
  calculatePerfectDays,
  calculateRbiKings,
  calculatePunchouts,
  calculateQualityStarts,
  calculateSaves,
  calculateHottestBats,
  calculatePowerSurge,
  calculateSpeedDemons,
  calculateLightsOut,
  calculateKLeaders,
  calculateWhipKings,
  calculateBestEyes,
  calculateContactKings,
  calculateCommandAces,
  calculateBestKBB,
  calculateIceCold,
  calculateRoughStretch,
  calculateHittingStreaks,
  calculateOnBaseStreaks,
  calculateHitlessStreaks,
  calculateScorelessStreaks,
  calculateLevelDebuts,
} from '../utils/dashboardCalculations';

async function fetchPlayerIndex(): Promise<PlayerIndex> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/player-index.json`);
  if (!response.ok) {
    return { players: [], year: new Date().getFullYear(), lastUpdated: '', count: 0 };
  }
  return response.json();
}

export function useDashboardData() {
  // Fetch all teams from IndexedDB
  const teams = useLiveQuery(() => db.teams.toArray(), []);

  // Fetch all team players from IndexedDB
  const allTeamPlayers = useLiveQuery(() => db.teamPlayers.toArray(), []);

  // Fetch player index
  const { data: playerIndex, isLoading: indexLoading } = useQuery({
    queryKey: ['player-index'],
    queryFn: fetchPlayerIndex,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Fetch current season stats
  const { data: statsResult, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchCurrentSeasonStats,
  });

  const isLoading = indexLoading || statsLoading || !teams || !allTeamPlayers;

  // Build a map of playerId -> first team name (for display)
  const playerTeamMap = useMemo(() => {
    if (!teams || !allTeamPlayers) return new Map<string, string>();

    const map = new Map<string, string>();
    const teamMap = new Map(teams.map(t => [t.id, t.name]));

    // Sort by team name to ensure consistent first team
    const sortedTeamPlayers = [...allTeamPlayers].sort((a, b) => {
      const aName = teamMap.get(a.teamId) || '';
      const bName = teamMap.get(b.teamId) || '';
      return aName.localeCompare(bName);
    });

    for (const tp of sortedTeamPlayers) {
      if (!map.has(tp.playerId)) {
        map.set(tp.playerId, teamMap.get(tp.teamId) || 'Unknown Team');
      }
    }

    return map;
  }, [teams, allTeamPlayers]);

  // Get unique player IDs across all teams
  const uniquePlayerIds = useMemo(() => {
    if (!allTeamPlayers) return new Set<string>();
    return new Set(allTeamPlayers.map(tp => tp.playerId));
  }, [allTeamPlayers]);

  // Build player context array with player info, team name, and stats
  const playersWithContext = useMemo(() => {
    if (!playerIndex || !statsResult?.stats) return [];

    const result: Array<{
      player: Player;
      teamName: string;
      stats: PlayerStatsData;
    }> = [];

    for (const playerId of uniquePlayerIds) {
      const stats = statsResult.stats[playerId];
      if (!stats) continue;

      // Find player in index
      const indexPlayer = playerIndex.players.find(p => p.mlbId === playerId);
      if (!indexPlayer) continue;

      const player: Player = {
        mlbId: indexPlayer.mlbId,
        name: indexPlayer.name,
        team: indexPlayer.team,
        org: indexPlayer.org,
        level: indexPlayer.level as Player['level'],
        position: indexPlayer.position,
        hasStatcast: indexPlayer.level === 'AAA',
      };

      const teamName = playerTeamMap.get(playerId) || 'Unknown Team';

      result.push({ player, teamName, stats });
    }

    return result;
  }, [playerIndex, statsResult?.stats, uniquePlayerIds, playerTeamMap]);

  // Calculate all dashboard data
  const dashboardData = useMemo((): DashboardData | null => {
    if (playersWithContext.length === 0) return null;

    const yesterdayDate = getYesterdayDate();

    // Yesterday
    const homeRuns = calculateHomeRuns(playersWithContext, yesterdayDate);
    const perfectDays = calculatePerfectDays(playersWithContext, yesterdayDate);
    const rbiKings = calculateRbiKings(playersWithContext, yesterdayDate);
    const punchouts = calculatePunchouts(playersWithContext, yesterdayDate);
    const qualityStarts = calculateQualityStarts(playersWithContext, yesterdayDate);
    const saves = calculateSaves(playersWithContext, yesterdayDate);

    // Check if there were any games yesterday
    const hasYesterdayGames =
      homeRuns.length > 0 ||
      perfectDays.length > 0 ||
      rbiKings.length > 0 ||
      punchouts.length > 0 ||
      qualityStarts.length > 0 ||
      saves.length > 0;

    // Hot 7 Days
    const hottestBats = calculateHottestBats(playersWithContext);
    const powerSurge = calculatePowerSurge(playersWithContext);
    const speedDemons = calculateSpeedDemons(playersWithContext);
    const lightsOut = calculateLightsOut(playersWithContext);
    const kLeaders = calculateKLeaders(playersWithContext);
    const whipKings = calculateWhipKings(playersWithContext);

    // Discipline
    const bestEyes = calculateBestEyes(playersWithContext);
    const contactKings = calculateContactKings(playersWithContext);

    // Command
    const commandAces = calculateCommandAces(playersWithContext);
    const bestKBB = calculateBestKBB(playersWithContext);

    // Cold
    const iceCold = calculateIceCold(playersWithContext);
    const roughStretch = calculateRoughStretch(playersWithContext);

    // Streaks
    const hittingStreaks = calculateHittingStreaks(playersWithContext);
    const onBaseStreaks = calculateOnBaseStreaks(playersWithContext);
    const hitlessStreaks = calculateHitlessStreaks(playersWithContext);
    const scorelessStreaks = calculateScorelessStreaks(playersWithContext);

    // Promotions
    const levelDebuts = calculateLevelDebuts(playersWithContext);

    return {
      // Yesterday
      homeRuns,
      perfectDays,
      rbiKings,
      punchouts,
      qualityStarts,
      saves,

      // Hot 7 Days
      hottestBats,
      powerSurge,
      speedDemons,
      lightsOut,
      kLeaders,
      whipKings,

      // Discipline
      bestEyes,
      contactKings,

      // Command
      commandAces,
      bestKBB,

      // Cold
      iceCold,
      hitlessStreaks,
      roughStretch,

      // Streaks
      hittingStreaks,
      onBaseStreaks,
      scorelessStreaks,

      // Promotions
      levelDebuts,

      // Statcast (placeholder - empty for now)
      maxExitVelo: [],
      barrelLeaders: [],

      // Meta
      yesterdayDate,
      hasYesterdayGames,
    };
  }, [playersWithContext]);

  return {
    data: dashboardData,
    isLoading,
    hasTeams: (teams?.length || 0) > 0,
    hasPlayers: uniquePlayerIds.size > 0,
  };
}
