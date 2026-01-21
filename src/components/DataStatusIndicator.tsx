// components/DataStatusIndicator.tsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MetaData } from '../types';

async function fetchMeta(): Promise<MetaData> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/meta.json`);
  if (!response.ok) throw new Error('Failed to fetch metadata');
  return response.json();
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

function isStale(dateString: string, thresholdHours: number = 6): boolean {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours > thresholdHours;
}

export function DataStatusIndicator() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const { data: meta, isLoading, isError, refetch } = useQuery({
    queryKey: ['meta'],
    queryFn: fetchMeta,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  });

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all data queries to force a fresh fetch
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meta'] }),
        queryClient.invalidateQueries({ queryKey: ['stats'] }),
        queryClient.invalidateQueries({ queryKey: ['players'] }),
        queryClient.invalidateQueries({ queryKey: ['player-index'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
        <span>Loading...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="w-2 h-2 bg-red-500 rounded-full" />
        <span className="text-red-600 dark:text-red-400">
          Failed to load status
        </span>
        <button
          onClick={() => refetch()}
          className="text-primary-600 dark:text-primary-400 hover:underline ml-1"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!meta) return null;

  const stale = isStale(meta.lastUpdated);
  const relativeTime = formatRelativeTime(meta.lastUpdated);

  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        className={`w-2 h-2 rounded-full ${
          stale ? 'bg-yellow-500' : 'bg-green-500'
        }`}
        title={stale ? 'Data may be outdated' : 'Data is fresh'}
      />
      <span className={stale ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'}>
        Updated {relativeTime}
      </span>
      {stale && (
        <span className="text-yellow-600 dark:text-yellow-400 text-xs">
          (stale)
        </span>
      )}
      {meta.playerCount > 0 && (
        <span className="text-gray-500 dark:text-gray-500 text-xs">
          • {meta.playerCount} players in registry
        </span>
      )}

      {/* Refresh button */}
      <button
        onClick={handleRefreshAll}
        disabled={isRefreshing}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
        title="Refresh cached data"
      >
        <svg
          className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Refresh
      </button>

      {/* Info button */}
      <div className="relative">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="inline-flex items-center justify-center w-4 h-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full border border-gray-300 dark:border-gray-600"
          title="How data updates work"
        >
          ?
        </button>

        {showInfo && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowInfo(false)}
            />
            <div className="absolute left-0 top-6 z-20 w-72 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
              <p className="font-medium text-gray-900 dark:text-white mb-2">
                How data updates work:
              </p>
              <ul className="space-y-1.5">
                <li>
                  <span className="font-medium">Auto updates:</span> Stats refresh every 4 hours during the season (daily off-season)
                </li>
                <li>
                  <span className="font-medium">New players:</span> Added players will have stats fetched in the next scheduled update
                </li>
                <li>
                  <span className="font-medium">Refresh button:</span> Re-fetches cached data from the server (doesn't trigger new data collection)
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
