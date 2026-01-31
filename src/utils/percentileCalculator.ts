// utils/percentileCalculator.ts
// Calculate percentile rankings for stats at each level
// Used for Savant-style blue/red color scheme display

import type { StatsFile, BattingStats, PitchingStats, MiLBLevel } from '../types';

export interface PercentileData {
  // Maps stat key -> sorted array of values (ascending) for percentile lookup
  [statKey: string]: number[];
}

export type PercentilesByLevel = Record<MiLBLevel, {
  batting: PercentileData;
  pitching: PercentileData;
}>;

// Minimum PA/IP for a player to be included in the percentile pool
const MIN_PA = 50;
const MIN_IP = 10;

// Stats where higher is worse (lower percentile = better)
// For these, we invert the color scheme (blue = high/good, red = low/bad)
const INVERTED_STATS = new Set([
  'K%', 'ERA', 'WHIP', 'BB/9', 'HR/9', 'FIP', 'xFIP', 'BABIP',
  'BB%',  // For pitchers BB% is bad; for batters it's good - handled in getPercentile
]);

// Stats where higher is better for batters but worse for pitchers
const BATTER_POSITIVE_STATS = new Set(['BB%']);

/**
 * Get the percentile (0-100) for a value within a sorted distribution.
 */
function getPercentileFromSorted(sortedValues: number[], value: number): number {
  if (sortedValues.length === 0) return 50;

  // Count values less than or equal to the given value
  let count = 0;
  for (const v of sortedValues) {
    if (v <= value) count++;
    else break;
  }

  return Math.round((count / sortedValues.length) * 100);
}

/**
 * Calculate percentile distributions for all stats at each level.
 */
export function calculatePercentilesByLevel(statsFile: StatsFile): PercentilesByLevel {
  const levels: MiLBLevel[] = ['AAA', 'AA', 'A+', 'A', 'CPX', 'MiLB'];

  // Collect stat values by level
  const battingByLevel: Record<string, Record<string, number[]>> = {};
  const pitchingByLevel: Record<string, Record<string, number[]>> = {};

  for (const level of levels) {
    battingByLevel[level] = {};
    pitchingByLevel[level] = {};
  }

  for (const playerStats of Object.values(statsFile)) {
    // Batting
    if (playerStats.battingGameLog && playerStats.battingGameLog.length > 0) {
      // Determine levels this player played at from game logs
      const playerLevels = new Set<string>();
      let totalPA = 0;
      for (const game of playerStats.battingGameLog) {
        if (game.level) playerLevels.add(game.level);
        totalPA += (game.stats as BattingStats)?.PA ?? 0;
      }

      if (totalPA >= MIN_PA && playerStats.batting) {
        // Add to MiLB pool
        addStatValues(battingByLevel['MiLB'], playerStats.batting);

        // Add to each level's pool from by-level stats
        if (playerStats.battingByLevel) {
          for (const [level, levelStats] of Object.entries(playerStats.battingByLevel)) {
            if (levelStats && (levelStats.PA ?? 0) >= MIN_PA) {
              if (!battingByLevel[level]) battingByLevel[level] = {};
              addStatValues(battingByLevel[level], levelStats);
            }
          }
        }
      }
    }

    // Pitching
    if (playerStats.pitchingGameLog && playerStats.pitchingGameLog.length > 0) {
      let totalIP = 0;
      for (const game of playerStats.pitchingGameLog) {
        totalIP += (game.stats as PitchingStats)?.IP ?? 0;
      }

      if (totalIP >= MIN_IP && playerStats.pitching) {
        addStatValues(pitchingByLevel['MiLB'], playerStats.pitching);

        if (playerStats.pitchingByLevel) {
          for (const [level, levelStats] of Object.entries(playerStats.pitchingByLevel)) {
            if (levelStats && (levelStats.IP ?? 0) >= MIN_IP) {
              if (!pitchingByLevel[level]) pitchingByLevel[level] = {};
              addStatValues(pitchingByLevel[level], levelStats);
            }
          }
        }
      }
    }
  }

  // Sort all arrays
  const result: Partial<PercentilesByLevel> = {};
  for (const level of levels) {
    const batting: PercentileData = {};
    const pitching: PercentileData = {};

    for (const [key, values] of Object.entries(battingByLevel[level] || {})) {
      if (values.length >= 5) { // Need at least 5 players for meaningful percentiles
        batting[key] = values.sort((a, b) => a - b);
      }
    }

    for (const [key, values] of Object.entries(pitchingByLevel[level] || {})) {
      if (values.length >= 5) {
        pitching[key] = values.sort((a, b) => a - b);
      }
    }

    result[level] = { batting, pitching };
  }

  return result as PercentilesByLevel;
}

function addStatValues(target: Record<string, number[]>, stats: BattingStats | PitchingStats) {
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number' && isFinite(value)) {
      if (!target[key]) target[key] = [];
      target[key].push(value);
    }
  }
}

/**
 * Get the percentile for a specific stat value at a given level.
 * Returns 0-100, or undefined if no percentile data available.
 */
export function getPercentile(
  percentiles: PercentilesByLevel,
  level: MiLBLevel,
  statKey: string,
  value: number | undefined,
  type: 'batting' | 'pitching'
): number | undefined {
  if (value === undefined || value === null) return undefined;

  const levelData = percentiles[level];
  if (!levelData) return undefined;

  const distribution = type === 'batting' ? levelData.batting[statKey] : levelData.pitching[statKey];
  if (!distribution || distribution.length === 0) return undefined;

  return getPercentileFromSorted(distribution, value);
}

/**
 * Check if a stat is "inverted" (lower value = better) for color purposes.
 * For batters: K% is bad (inverted), BB% is good (not inverted)
 * For pitchers: K% is good (not inverted), BB% is bad (inverted), ERA is bad (inverted)
 */
export function isStatInverted(statKey: string, type: 'batting' | 'pitching'): boolean {
  if (BATTER_POSITIVE_STATS.has(statKey)) {
    return type === 'pitching'; // Good for batters, bad for pitchers
  }
  if (statKey === 'K%') {
    return type === 'batting'; // Bad for batters, good for pitchers
  }
  return INVERTED_STATS.has(statKey);
}

/**
 * Get the Savant-style color for a percentile value.
 * Uses a blue (low/cold) to red (high/hot) gradient.
 * If the stat is inverted, the colors are reversed.
 */
export function getPercentileColor(
  percentile: number,
  statKey: string,
  type: 'batting' | 'pitching'
): { bg: string; text: string } {
  const inverted = isStatInverted(statKey, type);
  const p = inverted ? 100 - percentile : percentile;

  // Savant-style gradient: blue -> white -> red
  if (p <= 10) return { bg: '#2166ac', text: '#ffffff' };  // Deep blue
  if (p <= 20) return { bg: '#4393c3', text: '#ffffff' };  // Blue
  if (p <= 30) return { bg: '#92c5de', text: '#1a1a1a' };  // Light blue
  if (p <= 40) return { bg: '#d1e5f0', text: '#1a1a1a' };  // Very light blue
  if (p <= 50) return { bg: '#f7f7f7', text: '#1a1a1a' };  // Near white
  if (p <= 60) return { bg: '#f7f7f7', text: '#1a1a1a' };  // Near white
  if (p <= 70) return { bg: '#fddbc7', text: '#1a1a1a' };  // Very light red
  if (p <= 80) return { bg: '#f4a582', text: '#1a1a1a' };  // Light red
  if (p <= 90) return { bg: '#d6604d', text: '#ffffff' };  // Red
  return { bg: '#b2182b', text: '#ffffff' };                // Deep red
}
