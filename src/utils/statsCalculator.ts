// utils/statsCalculator.ts
// Calculate time-based splits from game logs on demand
// This ensures splits are always accurate relative to the current date

import type { BattingStats, PitchingStats, GameLogEntry } from '../types';

export interface DateRange {
  start: Date;
  end: Date;
}

// Preset split types
export type PresetSplit = 'season' | 'lastSeason' | 'last7' | 'last14' | 'last30' | 'yesterday' | 'today';

// Get date range for preset splits
export function getPresetDateRange(split: PresetSplit): DateRange | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (split) {
    case 'today':
      return { start: today, end: today };

    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: yesterday };
    }

    case 'last7': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6); // Include today = 7 days
      return { start, end: today };
    }

    case 'last14': {
      const start = new Date(today);
      start.setDate(start.getDate() - 13);
      return { start, end: today };
    }

    case 'last30': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start, end: today };
    }

    // Season splits don't use date filtering
    case 'season':
    case 'lastSeason':
      return null;

    default:
      return null;
  }
}

// Parse date string (YYYY-MM-DD) to Date object
function parseGameDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

// Filter game logs by date range
export function filterGameLogsByDateRange(
  gameLogs: GameLogEntry[],
  range: DateRange
): GameLogEntry[] {
  return gameLogs.filter(game => {
    const gameDate = parseGameDate(game.date);
    if (!gameDate) return false;
    return gameDate >= range.start && gameDate <= range.end;
  });
}

// Aggregate batting stats from multiple games
export function aggregateBattingStats(games: GameLogEntry[]): BattingStats | undefined {
  if (games.length === 0) return undefined;

  const countingStats = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'SO', 'HBP', 'SB', 'CS', 'SF', 'SH', 'GDP'] as const;

  const totals: BattingStats = {};

  // Sum counting stats
  for (const stat of countingStats) {
    let total = 0;
    for (const game of games) {
      const val = (game.stats as BattingStats)?.[stat];
      if (typeof val === 'number') total += val;
    }
    if (total > 0) totals[stat] = total;
  }

  // Always count games
  totals.G = games.length;

  // Calculate rate stats
  const ab = totals.AB || 0;
  const pa = totals.PA || 0;
  const h = totals.H || 0;
  const bb = totals.BB || 0;
  const hbp = totals.HBP || 0;
  const so = totals.SO || 0;
  const doubles = totals['2B'] || 0;
  const triples = totals['3B'] || 0;
  const hr = totals.HR || 0;

  if (ab > 0) {
    totals.AVG = Math.round((h / ab) * 1000) / 1000;
    const tb = h + doubles + 2 * triples + 3 * hr;
    totals.SLG = Math.round((tb / ab) * 1000) / 1000;
    totals.ISO = Math.round((totals.SLG - totals.AVG) * 1000) / 1000;
  }

  if (pa > 0) {
    totals.OBP = Math.round(((h + bb + hbp) / pa) * 1000) / 1000;
    totals['BB%'] = Math.round((100 * bb / pa) * 10) / 10;
    totals['K%'] = Math.round((100 * so / pa) * 10) / 10;
  }

  if (totals.OBP !== undefined && totals.SLG !== undefined) {
    totals.OPS = Math.round((totals.OBP + totals.SLG) * 1000) / 1000;
  }

  return totals;
}

// Aggregate pitching stats from multiple games
export function aggregatePitchingStats(games: GameLogEntry[]): PitchingStats | undefined {
  if (games.length === 0) return undefined;

  const countingStats = ['G', 'GS', 'W', 'L', 'SV', 'HLD', 'BS', 'H', 'R', 'ER', 'HR', 'BB', 'SO', 'HBP'] as const;

  const totals: PitchingStats = {};

  // Sum counting stats
  for (const stat of countingStats) {
    let total = 0;
    for (const game of games) {
      const val = (game.stats as PitchingStats)?.[stat];
      if (typeof val === 'number') total += val;
    }
    if (total > 0) totals[stat] = total;
  }

  // Always count games
  totals.G = games.length;

  // Sum IP (handles fractional innings)
  let ipTotal = 0;
  for (const game of games) {
    const ip = (game.stats as PitchingStats)?.IP;
    if (typeof ip === 'number') ipTotal += ip;
  }
  totals.IP = Math.round(ipTotal * 10) / 10;

  // Calculate rate stats
  const ip = totals.IP || 0;
  const er = totals.ER || 0;
  const h = totals.H || 0;
  const bb = totals.BB || 0;
  const so = totals.SO || 0;
  const hr = totals.HR || 0;
  const hbp = totals.HBP || 0;

  if (ip > 0) {
    totals.ERA = Math.round((9 * er / ip) * 100) / 100;
    totals.WHIP = Math.round(((bb + h) / ip) * 100) / 100;
    totals['K/9'] = Math.round((9 * so / ip) * 10) / 10;
    totals['BB/9'] = Math.round((9 * bb / ip) * 10) / 10;
    totals['HR/9'] = Math.round((9 * hr / ip) * 10) / 10;
  }

  // K% and BB% based on estimated batters faced
  const bf = h + bb + so + hbp;
  if (bf > 0) {
    totals['K%'] = Math.round((100 * so / bf) * 10) / 10;
    totals['BB%'] = Math.round((100 * bb / bf) * 10) / 10;
  }

  if (so > 0 && bb > 0) {
    totals['K/BB'] = Math.round((so / bb) * 100) / 100;
  }

  return totals;
}

// Main function to calculate stats for a date range
export function calculateStatsForDateRange(
  gameLogs: GameLogEntry[] | undefined,
  range: DateRange,
  type: 'batting' | 'pitching'
): BattingStats | PitchingStats | undefined {
  if (!gameLogs || gameLogs.length === 0) return undefined;

  const filtered = filterGameLogsByDateRange(gameLogs, range);
  if (filtered.length === 0) return undefined;

  return type === 'batting'
    ? aggregateBattingStats(filtered)
    : aggregatePitchingStats(filtered);
}

// Calculate stats for a preset split
export function calculateStatsForSplit(
  gameLogs: GameLogEntry[] | undefined,
  split: PresetSplit,
  type: 'batting' | 'pitching'
): BattingStats | PitchingStats | undefined {
  const range = getPresetDateRange(split);
  if (!range) return undefined; // Season splits don't use this

  return calculateStatsForDateRange(gameLogs, range, type);
}

// Format a date range for display
export function formatDateRange(range: DateRange): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = range.start.toLocaleDateString('en-US', opts);
  const endStr = range.end.toLocaleDateString('en-US', opts);

  if (startStr === endStr) return startStr;
  return `${startStr} - ${endStr}`;
}

// Create a custom date range
export function createDateRange(startDate: string, endDate: string): DateRange | null {
  const start = parseGameDate(startDate);
  const end = parseGameDate(endDate);

  if (!start || !end) return null;
  if (start > end) return null;

  return { start, end };
}
