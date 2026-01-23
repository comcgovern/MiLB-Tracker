// components/Dashboard/DashboardCard.tsx
import type { LeaderboardEntry, StreakEntry, PromotionEntry } from '../../types/dashboard';
import type { Player } from '../../types';

interface DashboardCardProps {
  title: string;
  emoji: string;
  entries: LeaderboardEntry[] | StreakEntry[] | PromotionEntry[];
  type: 'leaderboard' | 'streak' | 'promotion';
  onPlayerClick?: (player: Player) => void;
  placeholder?: boolean;
  placeholderText?: string;
}

export function DashboardCard({
  title,
  emoji,
  entries,
  type,
  onPlayerClick,
  placeholder = false,
  placeholderText = 'Coming Soon',
}: DashboardCardProps) {
  const isEmpty = entries.length === 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {emoji} {title}
        </h3>
      </div>

      {/* Content */}
      <div className="p-3">
        {placeholder ? (
          <div className="py-6 text-center text-gray-400 dark:text-gray-500 text-sm">
            {placeholderText}
          </div>
        ) : isEmpty ? (
          <div className="py-4 text-center text-gray-400 dark:text-gray-500 text-sm">
            No qualifying players
          </div>
        ) : (
          <div className="space-y-2">
            {type === 'leaderboard' && renderLeaderboardEntries(entries as LeaderboardEntry[], onPlayerClick)}
            {type === 'streak' && renderStreakEntries(entries as StreakEntry[], onPlayerClick)}
            {type === 'promotion' && renderPromotionEntries(entries as PromotionEntry[], onPlayerClick)}
          </div>
        )}
      </div>
    </div>
  );
}

function renderLeaderboardEntries(
  entries: LeaderboardEntry[],
  onPlayerClick?: (player: Player) => void
) {
  return entries.map((entry, index) => (
    <div
      key={`${entry.player.mlbId}-${index}`}
      className="flex items-start gap-2 py-1"
    >
      {/* Rank */}
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 w-4 pt-0.5">
        {index + 1}.
      </span>

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onPlayerClick?.(entry.player)}
          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 truncate block text-left"
        >
          {entry.player.name}
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{entry.subValue}</span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="text-gray-600 dark:text-gray-300">{entry.teamName}</span>
        </div>
      </div>

      {/* Value */}
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
        {entry.displayValue}
      </span>
    </div>
  ));
}

function renderStreakEntries(
  entries: StreakEntry[],
  onPlayerClick?: (player: Player) => void
) {
  return entries.map((entry, index) => (
    <div
      key={`${entry.player.mlbId}-${index}`}
      className="flex items-start gap-2 py-1"
    >
      {/* Rank */}
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 w-4 pt-0.5">
        {index + 1}.
      </span>

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <button
          onClick={() => onPlayerClick?.(entry.player)}
          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 truncate block text-left"
        >
          {entry.player.name}
        </button>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {entry.teamName}
        </div>
      </div>

      {/* Streak value */}
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
        {entry.displayValue}
      </span>
    </div>
  ));
}

function renderPromotionEntries(
  entries: PromotionEntry[],
  onPlayerClick?: (player: Player) => void
) {
  return entries.map((entry, index) => (
    <div
      key={`${entry.player.mlbId}-${index}`}
      className="py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPlayerClick?.(entry.player)}
          className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400"
        >
          {entry.player.name}
        </button>
        <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
          {entry.previousLevel} → {entry.newLevel}
        </span>
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{formatDate(entry.debutDate)}</span>
        <span className="mx-1">·</span>
        <span>Debut: {entry.displayValue}</span>
      </div>
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        {entry.teamName}
      </div>
    </div>
  ));
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
