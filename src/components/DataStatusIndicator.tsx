// components/DataStatusIndicator.tsx
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
          • {meta.playerCount} players
        </span>
      )}
    </div>
  );
}
