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
  ReferenceLine,
} from 'recharts';
import type { GameLogEntry, BattingStats, PitchingStats, MiLBLevel } from '../types';
import { LEVEL_COLORS, LEVEL_LABELS, type LeagueAveragesByLevel } from '../utils/leagueAveragesCalculator';

interface PlayerChartsProps {
  gameLog: GameLogEntry[];
  isBatter: boolean;
  leagueAverages?: LeagueAveragesByLevel | null;
}

type ChartMetric = {
  key: string;
  label: string;
  color: string;
  format?: (value: number) => string;
  pbpWeightKey?: 'BIP' | 'IP';  // PBP-derived stats that should use BIP or IP weighting for rolling calc
};

const BATTER_METRICS: ChartMetric[] = [
  { key: 'AVG', label: 'Batting Average', color: '#3b82f6', format: (v) => v.toFixed(3) },
  { key: 'OPS', label: 'OPS', color: '#10b981', format: (v) => v.toFixed(3) },
  { key: 'wOBA', label: 'wOBA', color: '#f59e0b', format: (v) => v.toFixed(3) },
  { key: 'SLG', label: 'Slugging', color: '#ef4444', format: (v) => v.toFixed(3) },
  { key: 'K%', label: 'K%', color: '#dc2626', format: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'BB%', label: 'BB%', color: '#16a34a', format: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'Swing%', label: 'Swing%', color: '#7c3aed', format: (v) => (v * 100).toFixed(1) + '%', pbpWeightKey: 'BIP' },
  { key: 'Contact%', label: 'Contact%', color: '#0891b2', format: (v) => (v * 100).toFixed(1) + '%', pbpWeightKey: 'BIP' },
  { key: 'GB%', label: 'GB%', color: '#ca8a04', format: (v) => (v * 100).toFixed(1) + '%', pbpWeightKey: 'BIP' },
  { key: 'Pull-Air%', label: 'Pull-Air%', color: '#be185d', format: (v) => (v * 100).toFixed(1) + '%', pbpWeightKey: 'BIP' },
  { key: 'HR/FB', label: 'HR/FB', color: '#9333ea', format: (v) => v.toFixed(3), pbpWeightKey: 'BIP' },
];

const PITCHER_METRICS: ChartMetric[] = [
  { key: 'ERA', label: 'ERA', color: '#3b82f6', format: (v) => v.toFixed(2) },
  { key: 'WHIP', label: 'WHIP', color: '#10b981', format: (v) => v.toFixed(2) },
  { key: 'K/9', label: 'K/9', color: '#f59e0b', format: (v) => v.toFixed(2) },
  { key: 'K%-BB%', label: 'K% - BB%', color: '#8b5cf6', format: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'K%', label: 'K%', color: '#dc2626', format: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'BB%', label: 'BB%', color: '#16a34a', format: (v) => (v * 100).toFixed(1) + '%' },
  { key: 'GB%', label: 'GB%', color: '#ca8a04', format: (v) => (v * 100).toFixed(1) + '%', pbpWeightKey: 'BIP' },
  { key: 'HR/FB', label: 'HR/FB', color: '#9333ea', format: (v) => v.toFixed(3), pbpWeightKey: 'BIP' },
  { key: 'CSW%', label: 'CSW%', color: '#0891b2', format: (v) => (v * 100).toFixed(1) + '%', pbpWeightKey: 'IP' },
  { key: 'Whiff%', label: 'Whiff%', color: '#be185d', format: (v) => (v * 100).toFixed(1) + '%', pbpWeightKey: 'IP' },
];

// Rolling window sizes
const BATTER_ROLLING_PA = 100;  // Rolling 100 PAs for batters
const PITCHER_ROLLING_IP = 18;   // Rolling 18 IP for pitchers

export function PlayerCharts({ gameLog, isBatter, leagueAverages }: PlayerChartsProps) {
  const metrics = isBatter ? BATTER_METRICS : PITCHER_METRICS;
  const [selectedMetric, setSelectedMetric] = useState<string>(metrics[0].key);
  const [viewMode, setViewMode] = useState<'game' | 'rolling'>('rolling');
  const [showLevelIndicators, setShowLevelIndicators] = useState(true);

  const selectedMetricConfig = metrics.find(m => m.key === selectedMetric) || metrics[0];

  // Process game log data for charts, including level information
  const { chartData, levelChanges, levelsInData } = useMemo(() => {
    if (!gameLog || gameLog.length === 0) return { chartData: [], levelChanges: [], levelsInData: [] as MiLBLevel[] };

    // Sort games by date
    const sortedGames = [...gameLog].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Track level changes
    const changes: { gameNum: number; date: string; fromLevel: MiLBLevel | null; toLevel: MiLBLevel }[] = [];
    const levelsSet = new Set<MiLBLevel>();
    let previousLevel: MiLBLevel | null = null;

    const data = sortedGames.map((game, index) => {
      const currentLevel = game.level as MiLBLevel | undefined;

      // Track unique levels
      if (currentLevel) {
        levelsSet.add(currentLevel);
      }

      // Detect level change
      if (currentLevel && currentLevel !== previousLevel) {
        changes.push({
          gameNum: index + 1,
          date: formatChartDate(game.date),
          fromLevel: previousLevel,
          toLevel: currentLevel,
        });
        previousLevel = currentLevel;
      }

      if (viewMode === 'game') {
        const stats = game.stats as BattingStats | PitchingStats;
        return {
          name: formatChartDate(game.date),
          gameNum: index + 1,
          value: stats?.[selectedMetric as keyof typeof stats] ?? 0,
          opponent: game.opponent,
          level: currentLevel,
        };
      } else {
        // Rolling average view based on PA (batters) or IP (pitchers)
        const windowGames = getWindowGames(sortedGames, index, isBatter);
        const rollingValue = calculateRollingValue(windowGames, selectedMetric, isBatter);

        return {
          name: formatChartDate(game.date),
          gameNum: index + 1,
          value: rollingValue,
          games: windowGames.length,
          level: currentLevel,
        };
      }
    });

    return {
      chartData: data,
      levelChanges: changes,
      levelsInData: Array.from(levelsSet) as MiLBLevel[]
    };
  }, [gameLog, selectedMetric, viewMode, isBatter]);

  // Calculate league average segments for the dynamic horizontal line
  const leagueAverageSegments = useMemo(() => {
    if (!leagueAverages || !showLevelIndicators || chartData.length === 0) return [];

    const segments: { startIndex: number; endIndex: number; level: MiLBLevel; avgValue: number }[] = [];
    let currentLevel: MiLBLevel | null = null;
    let segmentStart = 0;

    const getAvgValue = (level: MiLBLevel): number | undefined => {
      const levelAvgs = leagueAverages[level];
      if (!levelAvgs) return undefined;
      const avgStats = isBatter ? levelAvgs.batting : levelAvgs.pitching;
      if (!avgStats) return undefined;
      return avgStats[selectedMetric as keyof typeof avgStats] as number | undefined;
    };

    chartData.forEach((point, index) => {
      const pointLevel = point.level as MiLBLevel | undefined;

      if (pointLevel && pointLevel !== currentLevel) {
        // End previous segment
        if (currentLevel) {
          const avgValue = getAvgValue(currentLevel);
          if (avgValue !== undefined) {
            segments.push({
              startIndex: segmentStart,
              endIndex: index - 1,
              level: currentLevel,
              avgValue,
            });
          }
        }
        // Start new segment
        currentLevel = pointLevel;
        segmentStart = index;
      }
    });

    // Don't forget the last segment
    if (currentLevel) {
      const avgValue = getAvgValue(currentLevel);
      if (avgValue !== undefined) {
        segments.push({
          startIndex: segmentStart,
          endIndex: chartData.length - 1,
          level: currentLevel,
          avgValue,
        });
      }
    }

    return segments;
  }, [leagueAverages, showLevelIndicators, chartData, selectedMetric, isBatter]);

  // Get current level's league average for display
  const currentLevelAverage = useMemo(() => {
    if (!leagueAverages || chartData.length === 0) return null;

    // Use the last data point's level
    const lastPoint = chartData[chartData.length - 1];
    const level = lastPoint?.level as MiLBLevel | undefined;
    if (!level) return null;

    const levelAvgs = leagueAverages[level];
    if (!levelAvgs) return null;

    const avgStats = isBatter ? levelAvgs.batting : levelAvgs.pitching;
    if (!avgStats) return null;

    const avgValue = avgStats[selectedMetric as keyof typeof avgStats] as number | undefined;

    return avgValue !== undefined ? { level, value: avgValue } : null;
  }, [leagueAverages, chartData, selectedMetric, isBatter]);

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

        <div className="flex items-center gap-4">
          {/* Level indicators toggle */}
          {leagueAverages && levelsInData.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLevelIndicators}
                onChange={(e) => setShowLevelIndicators(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Level Indicators
              </span>
            </label>
          )}

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
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {selectedMetricConfig.label} {viewMode === 'rolling' ? (isBatter ? `(Last ${BATTER_ROLLING_PA} PA)` : `(Last ${PITCHER_ROLLING_IP} IP)`) : '(Per Game)'}
            </h4>
            {selectedMetricConfig.pbpWeightKey && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                PBP-derived stat
              </p>
            )}
          </div>
          {/* Show current league average */}
          {showLevelIndicators && currentLevelAverage && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {currentLevelAverage.level} Lg Avg: {formatTooltipValue(currentLevelAverage.value)}
            </span>
          )}
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
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
                formatter={(value: number, _name: string, props: any) => {
                  const level = props?.payload?.level;
                  const levelStr = level ? ` (${level})` : '';
                  return [formatTooltipValue(value) + levelStr, selectedMetricConfig.label];
                }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Legend
                content={({ payload }) => (
                  <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs">
                    {/* Metric legend item */}
                    {payload?.map((entry, index) => (
                      <div key={`legend-${index}`} className="flex items-center gap-1.5">
                        <div
                          className="w-4 h-0.5"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-gray-700 dark:text-gray-300">{entry.value}</span>
                      </div>
                    ))}
                    {/* Level legend items */}
                    {showLevelIndicators && levelsInData.length > 0 && (
                      <>
                        <span className="text-gray-400 dark:text-gray-500 mx-1">|</span>
                        <span className="text-gray-500 dark:text-gray-400">Levels:</span>
                        {levelsInData.map((level) => (
                          <div key={`level-${level}`} className="flex items-center gap-1">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: LEVEL_COLORS[level] }}
                            />
                            <span className="text-gray-700 dark:text-gray-300">{LEVEL_LABELS[level]}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              />

              {/* Vertical lines for level changes */}
              {showLevelIndicators && levelChanges.map((change, index) => (
                <ReferenceLine
                  key={`level-change-${index}`}
                  x={change.date}
                  stroke={LEVEL_COLORS[change.toLevel]}
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: `${LEVEL_LABELS[change.toLevel]}`,
                    position: 'top',
                    fill: LEVEL_COLORS[change.toLevel],
                    fontSize: 11,
                    fontWeight: 'bold',
                  }}
                />
              ))}

              {/* Horizontal lines for league averages - one per level segment */}
              {showLevelIndicators && leagueAverageSegments.map((segment, index) => (
                <ReferenceLine
                  key={`avg-${index}`}
                  y={segment.avgValue}
                  stroke={LEVEL_COLORS[segment.level]}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  strokeOpacity={0.7}
                  segment={[
                    { x: chartData[segment.startIndex]?.name, y: segment.avgValue },
                    { x: chartData[segment.endIndex]?.name, y: segment.avgValue },
                  ]}
                  ifOverflow="extendDomain"
                  label={
                    segment.endIndex === chartData.length - 1
                      ? {
                          value: `${LEVEL_LABELS[segment.level]} Avg`,
                          position: 'right',
                          fill: LEVEL_COLORS[segment.level],
                          fontSize: 10,
                        }
                      : undefined
                  }
                />
              ))}

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

      {/* Chart legend hint - only show when level indicators are on */}
      {showLevelIndicators && levelsInData.length > 0 && (
        <div className="text-center text-xs text-gray-500 dark:text-gray-500">
          Vertical dashed lines = level changes | Horizontal dashed lines = league average
        </div>
      )}

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

// Helper function to get window of games based on PA (batters) or IP (pitchers)
function getWindowGames(
  sortedGames: GameLogEntry[],
  currentIndex: number,
  isBatter: boolean
): GameLogEntry[] {
  const targetThreshold = isBatter ? BATTER_ROLLING_PA : PITCHER_ROLLING_IP;
  const windowGames: GameLogEntry[] = [];
  let accumulated = 0;

  // Work backwards from current game
  for (let i = currentIndex; i >= 0; i--) {
    const game = sortedGames[i];
    const stats = game.stats as BattingStats | PitchingStats;

    if (isBatter) {
      const pa = (stats as BattingStats)?.PA ?? 0;
      accumulated += pa;
    } else {
      const ip = (stats as PitchingStats)?.IP ?? 0;
      accumulated += ip;
    }

    windowGames.unshift(game);

    // Stop once we've accumulated enough PA/IP
    if (accumulated >= targetThreshold) {
      break;
    }
  }

  return windowGames;
}

// Helper function to calculate rolling value
function calculateRollingValue(
  games: GameLogEntry[],
  metric: string,
  isBatter: boolean
): number {
  if (games.length === 0) return 0;

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
        SO: acc.SO + (stats?.SO ?? 0),
        '2B': acc['2B'] + (stats?.['2B'] ?? 0),
        '3B': acc['3B'] + (stats?.['3B'] ?? 0),
        HR: acc.HR + (stats?.HR ?? 0),
        PA: acc.PA + (stats?.PA ?? 0),
      };
    }, { AB: 0, H: 0, BB: 0, HBP: 0, SF: 0, SO: 0, '2B': 0, '3B': 0, HR: 0, PA: 0 });

    if (metric === 'AVG' && totals.AB > 0) {
      return totals.H / totals.AB;
    }
    if (metric === 'OPS') {
      const obp = totals.PA > 0 ? (totals.H + totals.BB + totals.HBP) / totals.PA : 0;
      const tb = totals.H + totals['2B'] + 2 * totals['3B'] + 3 * totals.HR;
      const slg = totals.AB > 0 ? tb / totals.AB : 0;
      return obp + slg;
    }
    if (metric === 'SLG' && totals.AB > 0) {
      const singles = totals.H - totals['2B'] - totals['3B'] - totals.HR;
      const tb = singles + 2 * totals['2B'] + 3 * totals['3B'] + 4 * totals.HR;
      return tb / totals.AB;
    }
    if (metric === 'wOBA' && totals.PA > 0) {
      // wOBA linear weights (FanGraphs 2024 approximation)
      const singles = totals.H - totals['2B'] - totals['3B'] - totals.HR;
      const wOBA = (0.69 * totals.BB + 0.72 * totals.HBP + 0.88 * singles +
                   1.24 * totals['2B'] + 1.56 * totals['3B'] + 1.95 * totals.HR) / totals.PA;
      return wOBA;
    }
    if (metric === 'K%' && totals.PA > 0) {
      return totals.SO / totals.PA;
    }
    if (metric === 'BB%' && totals.PA > 0) {
      return totals.BB / totals.PA;
    }

    // PBP-derived stats: use BIP-weighted average of per-game values
    if (['Swing%', 'Contact%', 'GB%', 'Pull-Air%', 'HR/FB'].includes(metric)) {
      return calculateWeightedAverageFromGames(games, metric, 'BIP');
    }
  } else {
    // Pitcher rate stats
    const totals = games.reduce((acc, game) => {
      const stats = game.stats as PitchingStats;
      // Estimate batters faced: IP * 3 + H + BB (approximation)
      const bf = (stats?.IP ?? 0) * 3 + (stats?.H ?? 0) + (stats?.BB ?? 0);
      return {
        IP: acc.IP + (stats?.IP ?? 0),
        ER: acc.ER + (stats?.ER ?? 0),
        H: acc.H + (stats?.H ?? 0),
        BB: acc.BB + (stats?.BB ?? 0),
        SO: acc.SO + (stats?.SO ?? 0),
        HBP: acc.HBP + (stats?.HBP ?? 0),
        BF: acc.BF + bf,
      };
    }, { IP: 0, ER: 0, H: 0, BB: 0, SO: 0, HBP: 0, BF: 0 });

    if (metric === 'ERA' && totals.IP > 0) {
      return (9 * totals.ER) / totals.IP;
    }
    if (metric === 'WHIP' && totals.IP > 0) {
      return (totals.H + totals.BB) / totals.IP;
    }
    if (metric === 'K/9' && totals.IP > 0) {
      return (9 * totals.SO) / totals.IP;
    }
    if (metric === 'K%-BB%' && totals.BF > 0) {
      const kPct = totals.SO / totals.BF;
      const bbPct = totals.BB / totals.BF;
      return kPct - bbPct;
    }
    if (metric === 'K%' && totals.BF > 0) {
      return totals.SO / totals.BF;
    }
    if (metric === 'BB%' && totals.BF > 0) {
      return totals.BB / totals.BF;
    }

    // PBP-derived stats: use appropriate weighting
    if (['GB%', 'HR/FB'].includes(metric)) {
      return calculateWeightedAverageFromGames(games, metric, 'BIP');
    }
    if (['CSW%', 'Whiff%'].includes(metric)) {
      return calculateWeightedAverageFromGames(games, metric, 'IP');
    }
  }

  return 0;
}

// Helper to calculate weighted average of a stat from game logs
// Used for PBP-derived stats; weights by BIP for batted ball stats, IP/PA for others
function calculateWeightedAverageFromGames(
  games: GameLogEntry[],
  metric: string,
  weightKey: 'PA' | 'IP' | 'BIP'
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const game of games) {
    const stats = game.stats as BattingStats & PitchingStats;
    const value = stats?.[metric as keyof typeof stats];
    const weight = stats?.[weightKey] ?? 0;

    if (typeof value === 'number' && weight > 0) {
      weightedSum += value * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
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
