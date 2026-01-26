// utils/leagueAveragesCalculator.ts
// Calculate league-wide averages by level from all player data

import type { StatsFile, GameLogEntry, BattingStats, PitchingStats, MiLBLevel } from '../types';
import { aggregateBattingStats, aggregatePitchingStats, filterGameLogsByLevel } from './statsCalculator';

// Level colors for chart visualization
export const LEVEL_COLORS: Record<MiLBLevel, string> = {
  'AAA': '#ef4444',  // Red
  'AA': '#f97316',   // Orange
  'A+': '#eab308',   // Yellow
  'A': '#22c55e',    // Green
  'CPX': '#3b82f6',  // Blue
  'MiLB': '#8b5cf6', // Purple (aggregate)
};

// Level display names
export const LEVEL_LABELS: Record<MiLBLevel, string> = {
  'AAA': 'AAA',
  'AA': 'AA',
  'A+': 'A+',
  'A': 'A',
  'CPX': 'CPX',
  'MiLB': 'MiLB',
};

export interface LeagueAverages {
  batting: BattingStats | undefined;
  pitching: PitchingStats | undefined;
  batterCount: number;
  pitcherCount: number;
}

export type LeagueAveragesByLevel = Record<MiLBLevel, LeagueAverages>;

// Minimum thresholds for qualification
const MIN_PA_FOR_BATTING = 50;
const MIN_IP_FOR_PITCHING = 10;


/**
 * Calculate batting league averages for a specific level
 * Uses qualified players (minimum PA threshold)
 */
function calculateBattingLeagueAverages(
  statsFile: StatsFile,
  level: MiLBLevel
): { stats: BattingStats | undefined; playerCount: number } {
  const qualifiedPlayerLogs: GameLogEntry[][] = [];

  for (const playerStats of Object.values(statsFile)) {
    if (!playerStats.battingGameLog || playerStats.battingGameLog.length === 0) continue;

    // Get games at this level
    const levelLogs = filterGameLogsByLevel(playerStats.battingGameLog, level);
    if (levelLogs.length === 0) continue;

    // Calculate PA for this player at this level
    const totalPA = levelLogs.reduce((sum, game) => {
      return sum + ((game.stats as BattingStats)?.PA ?? 0);
    }, 0);

    // Only include if meets minimum PA threshold
    if (totalPA >= MIN_PA_FOR_BATTING) {
      qualifiedPlayerLogs.push(levelLogs);
    }
  }

  if (qualifiedPlayerLogs.length === 0) {
    return { stats: undefined, playerCount: 0 };
  }

  // Flatten all qualified player game logs and aggregate
  const allQualifiedLogs = qualifiedPlayerLogs.flat();
  const stats = aggregateBattingStats(allQualifiedLogs);

  return { stats, playerCount: qualifiedPlayerLogs.length };
}

/**
 * Calculate pitching league averages for a specific level
 * Uses qualified pitchers (minimum IP threshold)
 */
function calculatePitchingLeagueAverages(
  statsFile: StatsFile,
  level: MiLBLevel
): { stats: PitchingStats | undefined; playerCount: number } {
  const qualifiedPlayerLogs: GameLogEntry[][] = [];

  for (const playerStats of Object.values(statsFile)) {
    if (!playerStats.pitchingGameLog || playerStats.pitchingGameLog.length === 0) continue;

    // Get games at this level
    const levelLogs = filterGameLogsByLevel(playerStats.pitchingGameLog, level);
    if (levelLogs.length === 0) continue;

    // Calculate IP for this player at this level
    const totalIP = levelLogs.reduce((sum, game) => {
      return sum + ((game.stats as PitchingStats)?.IP ?? 0);
    }, 0);

    // Only include if meets minimum IP threshold
    if (totalIP >= MIN_IP_FOR_PITCHING) {
      qualifiedPlayerLogs.push(levelLogs);
    }
  }

  if (qualifiedPlayerLogs.length === 0) {
    return { stats: undefined, playerCount: 0 };
  }

  // Flatten all qualified player game logs and aggregate
  const allQualifiedLogs = qualifiedPlayerLogs.flat();
  const stats = aggregatePitchingStats(allQualifiedLogs);

  return { stats, playerCount: qualifiedPlayerLogs.length };
}

/**
 * Calculate league averages for all levels
 */
export function calculateLeagueAveragesByLevel(statsFile: StatsFile): LeagueAveragesByLevel {
  const levels: MiLBLevel[] = ['AAA', 'AA', 'A+', 'A', 'CPX', 'MiLB'];
  const result: Partial<LeagueAveragesByLevel> = {};

  for (const level of levels) {
    const battingResult = calculateBattingLeagueAverages(statsFile, level);
    const pitchingResult = calculatePitchingLeagueAverages(statsFile, level);

    result[level] = {
      batting: battingResult.stats,
      pitching: pitchingResult.stats,
      batterCount: battingResult.playerCount,
      pitcherCount: pitchingResult.playerCount,
    };
  }

  return result as LeagueAveragesByLevel;
}

/**
 * Get a specific stat's league average for a level
 */
export function getLeagueAverageForStat(
  averages: LeagueAveragesByLevel,
  level: MiLBLevel,
  stat: string,
  type: 'batting' | 'pitching'
): number | undefined {
  const levelAverages = averages[level];
  if (!levelAverages) return undefined;

  const stats = type === 'batting' ? levelAverages.batting : levelAverages.pitching;
  if (!stats) return undefined;

  return stats[stat as keyof typeof stats] as number | undefined;
}
