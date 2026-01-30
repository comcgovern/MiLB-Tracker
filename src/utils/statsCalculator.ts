// utils/statsCalculator.ts
// Calculate time-based splits from game logs on demand
// This ensures splits are always accurate relative to the current date

import type { BattingStats, PitchingStats, GameLogEntry, MiLBLevel, SituationalSplit, SituationalSplitStats } from '../types';

// Level display order (highest to lowest)
export const LEVEL_ORDER: MiLBLevel[] = ['AAA', 'AA', 'A+', 'A', 'CPX', 'MiLB'];

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
    // Store BB% and K% as decimals (0.155 = 15.5%) for consistent formatting
    totals['BB%'] = Math.round((bb / pa) * 1000) / 1000;
    totals['K%'] = Math.round((so / pa) * 1000) / 1000;

    // wOBA calculation using linear weights (2024 values approximation)
    // wOBA = (0.69*uBB + 0.72*HBP + 0.88*1B + 1.24*2B + 1.56*3B + 1.95*HR) / PA
    const singles = h - doubles - triples - hr;
    const wobaNum = 0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * doubles + 1.56 * triples + 1.95 * hr;
    totals.wOBA = Math.round((wobaNum / pa) * 1000) / 1000;
  }

  if (totals.OBP !== undefined && totals.SLG !== undefined) {
    totals.OPS = Math.round((totals.OBP + totals.SLG) * 1000) / 1000;
  }

  // BABIP = (H - HR) / (AB - SO - HR + SF)
  // Only calculate if denominator is meaningful
  const sf = totals.SF || 0;
  const babipDenom = ab - so - hr + sf;
  if (babipDenom > 0) {
    totals.BABIP = Math.round(((h - hr) / babipDenom) * 1000) / 1000;
  }

  // wRC+ approximation using wOBA
  // wRC+ = ((wOBA - lgwOBA) / wOBAscale + lgR/PA) / lgR/PA * 100
  // Using MiLB approximations: lgwOBA=0.315, wOBAscale=1.15, lgR/PA=0.11
  if (totals.wOBA !== undefined) {
    const lgwOBA = 0.315;
    const wOBAscale = 1.15;
    const lgRperPA = 0.11;
    const wrcPlus = ((totals.wOBA - lgwOBA) / wOBAscale + lgRperPA) / lgRperPA * 100;
    totals['wRC+'] = Math.round(wrcPlus);
  }

  // PBP-derived stats: aggregate using appropriate weighting
  // Sum BIP for downstream use
  let totalBIP = 0;
  for (const game of games) {
    const bip = (game.stats as BattingStats)?.BIP;
    if (typeof bip === 'number') totalBIP += bip;
  }
  if (totalBIP > 0) totals.BIP = totalBIP;

  // BIP-weighted stats (batted ball rates)
  for (const stat of ['GB%', 'FB%', 'LD%', 'HR/FB', 'Pull%', 'Pull-Air%', 'Center%', 'Oppo%'] as const) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const game of games) {
      const s = game.stats as BattingStats;
      const val = s?.[stat];
      const weight = s?.BIP ?? 0;
      if (typeof val === 'number' && weight > 0) {
        weightedSum += val * weight;
        totalWeight += weight;
      }
    }
    if (totalWeight > 0) {
      totals[stat] = Math.round((weightedSum / totalWeight) * 1000) / 1000;
    }
  }

  // PA-weighted stats (plate discipline)
  for (const stat of ['Swing%', 'Contact%'] as const) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const game of games) {
      const s = game.stats as BattingStats;
      const val = s?.[stat];
      const weight = s?.PA ?? 0;
      if (typeof val === 'number' && weight > 0) {
        weightedSum += val * weight;
        totalWeight += weight;
      }
    }
    if (totalWeight > 0) {
      totals[stat] = Math.round((weightedSum / totalWeight) * 1000) / 1000;
    }
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

  // Sum IP (handles baseball notation where .1 = 1/3, .2 = 2/3 innings)
  // Convert to total outs, then back to IP notation
  let totalOuts = 0;
  for (const game of games) {
    const gameIP = (game.stats as PitchingStats)?.IP;
    if (typeof gameIP === 'number') {
      const whole = Math.floor(gameIP);
      const partial = Math.round((gameIP - whole) * 10);
      totalOuts += whole * 3 + partial;
    }
  }
  const ipWhole = Math.floor(totalOuts / 3);
  const ipPartial = totalOuts % 3;
  totals.IP = Math.round((ipWhole + ipPartial / 10) * 10) / 10;

  // Calculate rate stats using true IP (in decimal innings for calculations)
  const ip = ipWhole + ipPartial / 3;
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
  // Store as decimals (0.255 = 25.5%) for consistent formatting
  const bf = h + bb + so + hbp;
  if (bf > 0) {
    totals['K%'] = Math.round((so / bf) * 1000) / 1000;
    totals['BB%'] = Math.round((bb / bf) * 1000) / 1000;
    // K%-BB% (strikeout rate minus walk rate)
    totals['K%-BB%'] = Math.round(((so - bb) / bf) * 1000) / 1000;
  }

  // BABIP for pitchers uses same formula as batters: (H - HR) / (AB - K - HR + SF)
  // Since we don't have AB or SF for pitchers, we estimate:
  // AB ≈ 3 * IP + H (outs per inning + hits)
  // BABIP = (H - HR) / (AB - K - HR) = (H - HR) / (3*IP + H - SO - HR)
  if (ip > 0) {
    const babipDenom = 3 * ip + h - so - hr;
    if (babipDenom > 0) {
      totals.BABIP = Math.round(((h - hr) / babipDenom) * 1000) / 1000;
    }
  }

  if (so > 0 && bb > 0) {
    totals['K/BB'] = Math.round((so / bb) * 100) / 100;
  }

  // PBP-derived stats: aggregate using appropriate weighting
  // Sum BIP for downstream use
  let totalBIP = 0;
  for (const game of games) {
    const bip = (game.stats as PitchingStats)?.BIP;
    if (typeof bip === 'number') totalBIP += bip;
  }
  if (totalBIP > 0) totals.BIP = totalBIP;

  // BIP-weighted stats (batted ball rates)
  for (const stat of ['GB%', 'FB%', 'LD%', 'HR/FB'] as const) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const game of games) {
      const s = game.stats as PitchingStats;
      const val = s?.[stat];
      const weight = s?.BIP ?? 0;
      if (typeof val === 'number' && weight > 0) {
        weightedSum += val * weight;
        totalWeight += weight;
      }
    }
    if (totalWeight > 0) {
      totals[stat] = Math.round((weightedSum / totalWeight) * 1000) / 1000;
    }
  }

  // IP-weighted stats (pitch-level metrics)
  for (const stat of ['Swing%', 'Contact%', 'CSW%'] as const) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (const game of games) {
      const s = game.stats as PitchingStats;
      const val = s?.[stat];
      const rawIP = s?.IP ?? 0;
      if (typeof val === 'number' && rawIP > 0) {
        weightedSum += val * rawIP;
        totalWeight += rawIP;
      }
    }
    if (totalWeight > 0) {
      totals[stat] = Math.round((weightedSum / totalWeight) * 1000) / 1000;
    }
  }

  // FIP = ((13*HR) + (3*(BB+HBP)) - (2*SO)) / IP + FIP constant
  // Using 3.10 as an approximation of the FIP constant
  if (ip > 0) {
    const fipConstant = 3.10;
    totals.FIP = Math.round(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + fipConstant) * 100) / 100;

    // xFIP uses league average HR/FB rate instead of actual HR
    // Since we don't have FB data, we estimate: BIP * lgFB% * lgHR/FB
    // BIP (Balls In Play) = BF - SO - BB - HBP
    // Using lgFB% = 35%, lgHR/FB = 10%, so expected HR = BIP * 0.035
    const bip = bf - so - bb - hbp;
    if (bip > 0) {
      const expectedHR = bip * 0.035;
      totals.xFIP = Math.round(((13 * expectedHR + 3 * (bb + hbp) - 2 * so) / ip + fipConstant) * 100) / 100;
    }
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

// Get unique levels from game logs
export function getLevelsFromGameLogs(gameLogs: GameLogEntry[] | undefined): MiLBLevel[] {
  if (!gameLogs || gameLogs.length === 0) return [];

  const levels = new Set<MiLBLevel>();
  for (const game of gameLogs) {
    if (game.level) {
      levels.add(game.level);
    }
  }

  // Sort by level order (highest to lowest)
  return LEVEL_ORDER.filter(level => levels.has(level));
}

// Filter game logs by level
export function filterGameLogsByLevel(
  gameLogs: GameLogEntry[],
  level: MiLBLevel
): GameLogEntry[] {
  return gameLogs.filter(game => game.level === level);
}

// Calculate stats for a specific level
export function calculateStatsForLevel(
  gameLogs: GameLogEntry[] | undefined,
  level: MiLBLevel,
  type: 'batting' | 'pitching'
): BattingStats | PitchingStats | undefined {
  if (!gameLogs || gameLogs.length === 0) return undefined;

  const filtered = filterGameLogsByLevel(gameLogs, level);
  if (filtered.length === 0) return undefined;

  return type === 'batting'
    ? aggregateBattingStats(filtered)
    : aggregatePitchingStats(filtered);
}

// Calculate stats for a specific level and date range
export function calculateStatsForLevelAndDateRange(
  gameLogs: GameLogEntry[] | undefined,
  level: MiLBLevel,
  range: DateRange,
  type: 'batting' | 'pitching'
): BattingStats | PitchingStats | undefined {
  if (!gameLogs || gameLogs.length === 0) return undefined;

  // Filter by both level and date range
  const filteredByLevel = filterGameLogsByLevel(gameLogs, level);
  const filteredByDate = filterGameLogsByDateRange(filteredByLevel, range);

  if (filteredByDate.length === 0) return undefined;

  return type === 'batting'
    ? aggregateBattingStats(filteredByDate)
    : aggregatePitchingStats(filteredByDate);
}

// Calculate stats for a specific level and preset split
export function calculateStatsForLevelAndSplit(
  gameLogs: GameLogEntry[] | undefined,
  level: MiLBLevel,
  split: PresetSplit,
  type: 'batting' | 'pitching'
): BattingStats | PitchingStats | undefined {
  const range = getPresetDateRange(split);
  if (!range) return undefined; // Season splits don't use this

  return calculateStatsForLevelAndDateRange(gameLogs, level, range, type);
}

// ============================================
// SITUATIONAL SPLITS (Home/Away, vs L/R)
// ============================================

// Filter game logs by home/away
export function filterGameLogsByHomeAway(
  gameLogs: GameLogEntry[],
  isHome: boolean
): GameLogEntry[] {
  return gameLogs.filter(game => game.isHome === isHome);
}

// Filter game logs by opponent handedness
export function filterGameLogsByOpponentHand(
  gameLogs: GameLogEntry[],
  hand: 'L' | 'R'
): GameLogEntry[] {
  return gameLogs.filter(game => game.opponentHand === hand);
}

// Filter game logs by situational split type
export function filterGameLogsBySituationalSplit(
  gameLogs: GameLogEntry[],
  split: SituationalSplit
): GameLogEntry[] {
  switch (split) {
    case 'home':
      return filterGameLogsByHomeAway(gameLogs, true);
    case 'away':
      return filterGameLogsByHomeAway(gameLogs, false);
    case 'vsL':
      return filterGameLogsByOpponentHand(gameLogs, 'L');
    case 'vsR':
      return filterGameLogsByOpponentHand(gameLogs, 'R');
    case 'all':
    default:
      return gameLogs;
  }
}

// Calculate stats for a situational split
export function calculateStatsForSituationalSplit(
  gameLogs: GameLogEntry[] | undefined,
  split: SituationalSplit,
  type: 'batting' | 'pitching'
): BattingStats | PitchingStats | undefined {
  if (!gameLogs || gameLogs.length === 0) return undefined;

  const filtered = filterGameLogsBySituationalSplit(gameLogs, split);
  if (filtered.length === 0) return undefined;

  return type === 'batting'
    ? aggregateBattingStats(filtered)
    : aggregatePitchingStats(filtered);
}

// Calculate all situational splits at once
export function calculateAllSituationalSplits(
  gameLogs: GameLogEntry[] | undefined,
  type: 'batting' | 'pitching'
): SituationalSplitStats {
  if (!gameLogs || gameLogs.length === 0) return {};

  return {
    home: calculateStatsForSituationalSplit(gameLogs, 'home', type),
    away: calculateStatsForSituationalSplit(gameLogs, 'away', type),
    vsL: calculateStatsForSituationalSplit(gameLogs, 'vsL', type),
    vsR: calculateStatsForSituationalSplit(gameLogs, 'vsR', type),
  };
}

// Check if home/away data is available in game logs
export function hasHomeAwayData(gameLogs: GameLogEntry[] | undefined): boolean {
  if (!gameLogs || gameLogs.length === 0) return false;
  return gameLogs.some(game => game.isHome !== undefined);
}

// Check if opponent handedness data is available in game logs
export function hasOpponentHandData(gameLogs: GameLogEntry[] | undefined): boolean {
  if (!gameLogs || gameLogs.length === 0) return false;
  return gameLogs.some(game => game.opponentHand !== undefined);
}

// Get game counts for each situational split
export function getSituationalSplitGameCounts(
  gameLogs: GameLogEntry[] | undefined
): { home: number; away: number; vsL: number; vsR: number; total: number } {
  if (!gameLogs || gameLogs.length === 0) {
    return { home: 0, away: 0, vsL: 0, vsR: 0, total: 0 };
  }

  return {
    home: gameLogs.filter(g => g.isHome === true).length,
    away: gameLogs.filter(g => g.isHome === false).length,
    vsL: gameLogs.filter(g => g.opponentHand === 'L').length,
    vsR: gameLogs.filter(g => g.opponentHand === 'R').length,
    total: gameLogs.length,
  };
}
