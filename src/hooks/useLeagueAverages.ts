// hooks/useLeagueAverages.ts
// Hook to fetch and calculate league averages by level

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCurrentSeasonStats } from '../utils/statsService';
import { calculateLeagueAveragesByLevel, type LeagueAveragesByLevel } from '../utils/leagueAveragesCalculator';

export function useLeagueAverages() {
  // Fetch current season stats (uses shared React Query cache)
  const { data: statsResult, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchCurrentSeasonStats,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Calculate league averages from all player data
  const leagueAverages = useMemo((): LeagueAveragesByLevel | null => {
    if (!statsResult?.stats) return null;

    return calculateLeagueAveragesByLevel(statsResult.stats);
  }, [statsResult?.stats]);

  return {
    leagueAverages,
    isLoading,
    isError,
  };
}
