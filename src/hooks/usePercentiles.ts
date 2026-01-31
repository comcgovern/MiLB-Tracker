// hooks/usePercentiles.ts
// Hook to calculate and cache percentile rankings by level

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCurrentSeasonStats } from '../utils/statsService';
import { calculatePercentilesByLevel, type PercentilesByLevel } from '../utils/percentileCalculator';

export function usePercentiles() {
  const { data: statsResult, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchCurrentSeasonStats,
    staleTime: 1000 * 60 * 5,
  });

  const percentiles = useMemo((): PercentilesByLevel | null => {
    if (!statsResult?.stats) return null;
    return calculatePercentilesByLevel(statsResult.stats);
  }, [statsResult?.stats]);

  return { percentiles, isLoading };
}
