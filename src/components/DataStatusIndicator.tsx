// components/DataStatusIndicator.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const [showInfo, setShowInfo] = useState(false);

  const { data: meta, isLoading, isError, refetch } = useQuery({
    queryKey: ['meta'],
    queryFn: fetchMeta,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 5, // Refetch every 5 minutes
  });

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
                  <span className="font-medium">Auto updates:</span> Stats refresh daily at midnight UTC during the season
                </li>
                <li>
                  <span className="font-medium">New players:</span> Added players will have stats fetched in the next scheduled update
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
