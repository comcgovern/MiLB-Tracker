// components/PlayerCharts.tsx
import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { GameLogEntry, BattingStats, PitchingStats } from '../types';

interface PlayerChartsProps {
  gameLog: GameLogEntry[];
  isBatter: boolean;
}

type ChartMetric = {
  key: string;
  label: string;
  color: string;
  format?: (value: number) => string;
};

const BATTER_METRICS: ChartMetric[] = [
  { key: 'AVG', label: 'Batting Average', color: '#3b82f6', format: (v) => v.toFixed(3) },
  { key: 'OPS', label: 'OPS', color: '#10b981', format: (v) => v.toFixed(3) },
  { key: 'HR', label: 'Home Runs', color: '#f59e0b' },
  { key: 'RBI', label: 'RBIs', color: '#ef4444' },
  { key: 'SB', label: 'Stolen Bases', color: '#8b5cf6' },
];

const PITCHER_METRICS: ChartMetric[] = [
  { key: 'ERA', label: 'ERA', color: '#3b82f6', format: (v) => v.toFixed(2) },
  { key: 'WHIP', label: 'WHIP', color: '#10b981', format: (v) => v.toFixed(2) },
  { key: 'SO', label: 'Strikeouts', color: '#f59e0b' },
  { key: 'IP', label: 'Innings Pitched', color: '#8b5cf6', format: (v) => v.toFixed(1) },
];

export function PlayerCharts({ gameLog, isBatter }: PlayerChartsProps) {
  const metrics = isBatter ? BATTER_METRICS : PITCHER_METRICS;
  const [selectedMetric, setSelectedMetric] = useState<string>(metrics[0].key);
  const [viewMode, setViewMode] = useState<'game' | 'rolling'>('rolling');

  const selectedMetricConfig = metrics.find(m => m.key === selectedMetric) || metrics[0];

  // Process game log data for charts
  const chartData = useMemo(() => {
    if (!gameLog || gameLog.length === 0) return [];

    // Sort games by date
    const sortedGames = [...gameLog].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (viewMode === 'game') {
      // Per-game view
      return sortedGames.map((game, index) => {
        const stats = game.stats as BattingStats | PitchingStats;
        return {
          name: formatChartDate(game.date),
          gameNum: index + 1,
          value: stats?.[selectedMetric as keyof typeof stats] ?? 0,
          opponent: game.opponent,
        };
      });
    } else {
      // Rolling average view (7-game rolling)
      const windowSize = Math.min(7, sortedGames.length);
      return sortedGames.map((game, index) => {
        // Calculate rolling stats up to this game
        const windowStart = Math.max(0, index - windowSize + 1);
        const windowGames = sortedGames.slice(windowStart, index + 1);

        const rollingValue = calculateRollingValue(windowGames, selectedMetric, isBatter);

        return {
          name: formatChartDate(game.date),
          gameNum: index + 1,
          value: rollingValue,
          games: windowGames.length,
        };
      });
    }
  }, [gameLog, selectedMetric, viewMode, isBatter]);

  // Calculate season trend line
  const trendData = useMemo(() => {
    if (chartData.length < 2) return null;

    const n = chartData.length;
    const sumX = chartData.reduce((sum, _, i) => sum + i, 0);
    const sumY = chartData.reduce((sum, d) => sum + (d.value || 0), 0);
    const sumXY = chartData.reduce((sum, d, i) => sum + i * (d.value || 0), 0);
    const sumXX = chartData.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }, [chartData]);

  const formatTooltipValue = (value: number) => {
    if (selectedMetricConfig.format) {
      return selectedMetricConfig.format(value);
    }
    return Math.round(value).toString();
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Metric:
          </label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="input text-sm"
          >
            {metrics.map((metric) => (
              <option key={metric.key} value={metric.key}>
                {metric.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            View:
          </label>
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => setViewMode('rolling')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'rolling'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Rolling Avg
            </button>
            <button
              onClick={() => setViewMode('game')}
              className={`px-3 py-1 text-sm ${
                viewMode === 'game'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Per Game
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          {selectedMetricConfig.label} {viewMode === 'rolling' ? '(7-Game Rolling)' : '(Per Game)'}
        </h4>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={{ stroke: '#4b5563' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickLine={{ stroke: '#4b5563' }}
                tickFormatter={(value) => formatTooltipValue(value)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '0.5rem',
                  color: '#f9fafb',
                }}
                formatter={(value: number) => [formatTooltipValue(value), selectedMetricConfig.label]}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="value"
                name={selectedMetricConfig.label}
                stroke={selectedMetricConfig.color}
                strokeWidth={2}
                dot={{ fill: selectedMetricConfig.color, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-500 dark:text-gray-400">
            No data available for this metric
          </div>
        )}
      </div>

      {/* Trend indicator */}
      {trendData && chartData.length >= 5 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">Season Trend:</span>
          {trendData.slope > 0.001 ? (
            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Improving
            </span>
          ) : trendData.slope < -0.001 ? (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Declining
            </span>
          ) : (
            <span className="text-gray-600 dark:text-gray-400">Stable</span>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to calculate rolling value
function calculateRollingValue(
  games: GameLogEntry[],
  metric: string,
  isBatter: boolean
): number {
  if (games.length === 0) return 0;

  // For counting stats, sum them up
  const countingStats = ['HR', 'RBI', 'SB', 'SO', 'BB', 'H', 'R'];
  if (countingStats.includes(metric)) {
    return games.reduce((sum, game) => {
      const stats = game.stats as BattingStats | PitchingStats;
      return sum + ((stats?.[metric as keyof typeof stats] as number) ?? 0);
    }, 0);
  }

  // For rate stats, calculate from counting stats
  if (isBatter) {
    const totals = games.reduce((acc, game) => {
      const stats = game.stats as BattingStats;
      return {
        AB: acc.AB + (stats?.AB ?? 0),
        H: acc.H + (stats?.H ?? 0),
        BB: acc.BB + (stats?.BB ?? 0),
        HBP: acc.HBP + (stats?.HBP ?? 0),
        SF: acc.SF + (stats?.SF ?? 0),
        '2B': acc['2B'] + (stats?.['2B'] ?? 0),
        '3B': acc['3B'] + (stats?.['3B'] ?? 0),
        HR: acc.HR + (stats?.HR ?? 0),
        PA: acc.PA + (stats?.PA ?? 0),
      };
    }, { AB: 0, H: 0, BB: 0, HBP: 0, SF: 0, '2B': 0, '3B': 0, HR: 0, PA: 0 });

    if (metric === 'AVG' && totals.AB > 0) {
      return totals.H / totals.AB;
    }
    if (metric === 'OPS') {
      const obp = totals.PA > 0 ? (totals.H + totals.BB + totals.HBP) / totals.PA : 0;
      const tb = totals.H + totals['2B'] + 2 * totals['3B'] + 3 * totals.HR;
      const slg = totals.AB > 0 ? tb / totals.AB : 0;
      return obp + slg;
    }
  } else {
    // Pitcher rate stats
    const totals = games.reduce((acc, game) => {
      const stats = game.stats as PitchingStats;
      return {
        IP: acc.IP + (stats?.IP ?? 0),
        ER: acc.ER + (stats?.ER ?? 0),
        H: acc.H + (stats?.H ?? 0),
        BB: acc.BB + (stats?.BB ?? 0),
      };
    }, { IP: 0, ER: 0, H: 0, BB: 0 });

    if (metric === 'ERA' && totals.IP > 0) {
      return (9 * totals.ER) / totals.IP;
    }
    if (metric === 'WHIP' && totals.IP > 0) {
      return (totals.H + totals.BB) / totals.IP;
    }
    if (metric === 'IP') {
      return totals.IP;
    }
  }

  return 0;
}

function formatChartDate(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}
