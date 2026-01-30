// utils/statsService.ts
// Service for fetching and merging monthly stats files

import type { StatsFile, PlayerStatsData, GameLogEntry, BattingStats, PitchingStats } from '../types';

const basePath = import.meta.env.VITE_BASE_PATH || '';

// Cache for loaded monthly data
const monthlyStatsCache: Map<string, StatsFile> = new Map();
const manifestCache: Map<number, MonthlyManifest> = new Map();

interface MonthlyManifest {
  year: number;
  updated: string;
  months: number[];
}

interface MonthlyStatsFile {
  year: number;
  month: number;
  updated: string;
  players: StatsFile;
}

// Get manifest for a year
async function fetchManifest(year: number): Promise<MonthlyManifest | null> {
  // Check cache first
  if (manifestCache.has(year)) {
    return manifestCache.get(year)!;
  }

  try {
    const response = await fetch(`${basePath}/data/stats/${year}/manifest.json`);
    if (!response.ok) {
      return null;
    }
    const manifest = await response.json() as MonthlyManifest;
    manifestCache.set(year, manifest);
    return manifest;
  } catch {
    return null;
  }
}

// Fetch a single month's stats
async function fetchMonthStats(year: number, month: number): Promise<StatsFile> {
  const cacheKey = `${year}-${month.toString().padStart(2, '0')}`;

  // Check cache first
  if (monthlyStatsCache.has(cacheKey)) {
    return monthlyStatsCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(`${basePath}/data/stats/${year}/${month.toString().padStart(2, '0')}.json`);
    if (!response.ok) {
      return {};
    }
    const data = await response.json() as MonthlyStatsFile;
    const stats = data.players || {};
    monthlyStatsCache.set(cacheKey, stats);
    return stats;
  } catch {
    return {};
  }
}

// Try to fetch legacy single-file stats (fallback for old data structure)
async function fetchLegacyStats(year: number): Promise<StatsFile | null> {
  try {
    const response = await fetch(`${basePath}/data/stats/${year}.json`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

// Merge game logs from multiple sources, removing duplicates
function mergeGameLogs(logs1: GameLogEntry[] | undefined, logs2: GameLogEntry[] | undefined): GameLogEntry[] {
  if (!logs1 && !logs2) return [];
  if (!logs1) return logs2 || [];
  if (!logs2) return logs1;

  // Use a Map to deduplicate by date + gameId
  const logMap = new Map<string, GameLogEntry>();

  for (const log of logs1) {
    const key = `${log.date}-${log.gameId || ''}`;
    logMap.set(key, log);
  }

  for (const log of logs2) {
    const key = `${log.date}-${log.gameId || ''}`;
    if (!logMap.has(key)) {
      logMap.set(key, log);
    }
  }

  // Sort by date
  return Array.from(logMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Merge stats by level from multiple sources
function mergeStatsByLevel<T extends BattingStats | PitchingStats>(
  stats1: Record<string, T> | undefined,
  stats2: Record<string, T> | undefined,
  aggregator: (stats: T[]) => T | undefined
): Record<string, T> | undefined {
  if (!stats1 && !stats2) return undefined;
  if (!stats1) return stats2;
  if (!stats2) return stats1;

  const result: Record<string, T> = {};
  const allLevels = new Set([...Object.keys(stats1), ...Object.keys(stats2)]);

  for (const level of allLevels) {
    const s1 = stats1[level];
    const s2 = stats2[level];

    if (s1 && s2) {
      // Merge by aggregating (convert to game log format for aggregation)
      const merged = aggregator([s1, s2]);
      if (merged) {
        result[level] = merged;
      }
    } else if (s1) {
      result[level] = s1;
    } else if (s2) {
      result[level] = s2;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

// Helper to compute PA-weighted average of a rate stat across multiple months
function weightedAverageByPA(
  statsList: BattingStats[],
  statKey: keyof BattingStats
): number | undefined {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const s of statsList) {
    const val = s[statKey];
    const pa = s.PA || 0;
    if (typeof val === 'number' && pa > 0) {
      weightedSum += val * pa;
      totalWeight += pa;
    }
  }

  if (totalWeight > 0) {
    return Math.round((weightedSum / totalWeight) * 1000) / 1000;
  }
  return undefined;
}

// Helper to compute BIP-weighted average of a rate stat across multiple months
function weightedAverageByBIP(
  statsList: BattingStats[],
  statKey: keyof BattingStats
): number | undefined {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const s of statsList) {
    const val = s[statKey];
    const bip = s.BIP || 0;
    if (typeof val === 'number' && bip > 0) {
      weightedSum += val * bip;
      totalWeight += bip;
    }
  }

  if (totalWeight > 0) {
    return Math.round((weightedSum / totalWeight) * 1000) / 1000;
  }
  return undefined;
}

// Aggregate batting stats from pre-computed monthly totals
function aggregateBattingFromMonthly(statsList: BattingStats[]): BattingStats | undefined {
  if (statsList.length === 0) return undefined;

  const countingStats = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'SO', 'HBP', 'SB', 'CS', 'SF', 'SH', 'GDP'] as const;
  const totals: BattingStats = {};

  for (const stat of countingStats) {
    let total = 0;
    for (const s of statsList) {
      const val = s[stat];
      if (typeof val === 'number') total += val;
    }
    if (total > 0) totals[stat] = total;
  }

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
  const sf = totals.SF || 0;

  if (ab > 0) {
    totals.AVG = Math.round((h / ab) * 1000) / 1000;
    const tb = h + doubles + 2 * triples + 3 * hr;
    totals.SLG = Math.round((tb / ab) * 1000) / 1000;
    totals.ISO = Math.round((totals.SLG - totals.AVG) * 1000) / 1000;
  }

  if (pa > 0) {
    totals.OBP = Math.round(((h + bb + hbp) / pa) * 1000) / 1000;
    totals['BB%'] = Math.round((bb / pa) * 1000) / 1000;
    totals['K%'] = Math.round((so / pa) * 1000) / 1000;

    const singles = h - doubles - triples - hr;
    const wobaNum = 0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * doubles + 1.56 * triples + 1.95 * hr;
    totals.wOBA = Math.round((wobaNum / pa) * 1000) / 1000;
  }

  if (totals.OBP !== undefined && totals.SLG !== undefined) {
    totals.OPS = Math.round((totals.OBP + totals.SLG) * 1000) / 1000;
  }

  const babipDenom = ab - so - hr + sf;
  if (babipDenom > 0) {
    totals.BABIP = Math.round(((h - hr) / babipDenom) * 1000) / 1000;
  }

  if (totals.wOBA !== undefined) {
    const lgwOBA = 0.315;
    const wOBAscale = 1.15;
    const lgRperPA = 0.11;
    const wrcPlus = ((totals.wOBA - lgwOBA) / wOBAscale + lgRperPA) / lgRperPA * 100;
    totals['wRC+'] = Math.round(wrcPlus);
  }

  // Sum BIP counts for downstream use
  let totalBIP = 0;
  for (const s of statsList) {
    if (typeof s.BIP === 'number') totalBIP += s.BIP;
  }
  if (totalBIP > 0) totals.BIP = totalBIP;

  // Aggregate batted ball stats using BIP-weighted averaging (more accurate than PA)
  const bipWeightedStats = [
    'GB%', 'FB%', 'LD%', 'HR/FB',  // Batted ball stats
    'Pull%', 'Pull-Air%',           // Pull stats
  ] as const;

  for (const stat of bipWeightedStats) {
    const weighted = weightedAverageByBIP(statsList, stat);
    if (weighted !== undefined) {
      totals[stat] = weighted;
    }
  }

  // Plate discipline stats weighted by PA (only present when pitch-level data is available)
  const paWeightedStats = [
    'Swing%', 'Contact%',
  ] as const;

  for (const stat of paWeightedStats) {
    const weighted = weightedAverageByPA(statsList, stat);
    if (weighted !== undefined) {
      totals[stat] = weighted;
    }
  }

  return totals;
}

// Helper to compute IP-weighted average of a rate stat across multiple months for pitchers
function weightedAverageByIP(
  statsList: PitchingStats[],
  statKey: keyof PitchingStats
): number | undefined {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const s of statsList) {
    const val = s[statKey];
    const ip = s.IP || 0;
    if (typeof val === 'number' && ip > 0) {
      weightedSum += val * ip;
      totalWeight += ip;
    }
  }

  if (totalWeight > 0) {
    return Math.round((weightedSum / totalWeight) * 1000) / 1000;
  }
  return undefined;
}

// Helper to compute BIP-weighted average of a rate stat for pitchers
function weightedAverageByBIPPitching(
  statsList: PitchingStats[],
  statKey: keyof PitchingStats
): number | undefined {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const s of statsList) {
    const val = s[statKey];
    const bip = s.BIP || 0;
    if (typeof val === 'number' && bip > 0) {
      weightedSum += val * bip;
      totalWeight += bip;
    }
  }

  if (totalWeight > 0) {
    return Math.round((weightedSum / totalWeight) * 1000) / 1000;
  }
  return undefined;
}

// Aggregate pitching stats from pre-computed monthly totals
function aggregatePitchingFromMonthly(statsList: PitchingStats[]): PitchingStats | undefined {
  if (statsList.length === 0) return undefined;

  const countingStats = ['G', 'GS', 'W', 'L', 'SV', 'HLD', 'BS', 'H', 'R', 'ER', 'HR', 'BB', 'SO', 'HBP'] as const;
  const totals: PitchingStats = {};

  for (const stat of countingStats) {
    let total = 0;
    for (const s of statsList) {
      const val = s[stat];
      if (typeof val === 'number') total += val;
    }
    if (total > 0) totals[stat] = total;
  }

  // Sum IP
  let ipTotal = 0;
  for (const s of statsList) {
    const ip = s.IP;
    if (typeof ip === 'number') {
      // Handle IP as decimal (5.2 = 5 2/3 innings)
      const whole = Math.floor(ip);
      const partial = Math.round((ip - whole) * 10);
      ipTotal += whole * 3 + partial;
    }
  }
  const ipWhole = Math.floor(ipTotal / 3);
  const ipPartial = ipTotal % 3;
  totals.IP = Math.round((ipWhole + ipPartial / 10) * 10) / 10;

  // Calculate rate stats
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

  // Batters faced ≈ outs + baserunners = 3*IP + H + BB + HBP
  const bf = ipTotal + h + bb + hbp;
  if (bf > 0) {
    totals['K%'] = Math.round((so / bf) * 1000) / 1000;
    totals['BB%'] = Math.round((bb / bf) * 1000) / 1000;
    // K%-BB% (strikeout rate minus walk rate)
    totals['K%-BB%'] = Math.round(((so - bb) / bf) * 1000) / 1000;
  }

  // BABIP for pitchers: (H - HR) / (BIP) where BIP = H - HR + outs on balls in play
  // Outs on balls in play ≈ total outs - SO = 3*IP - SO
  // So BABIP = (H - HR) / (H - HR + 3*IP - SO) = (H - HR) / (3*IP + H - SO - HR)
  if (ip > 0) {
    const babipDenom = 3 * ip + h - so - hr;
    if (babipDenom > 0) {
      totals.BABIP = Math.round(((h - hr) / babipDenom) * 1000) / 1000;
    }
  }

  if (so > 0 && bb > 0) {
    totals['K/BB'] = Math.round((so / bb) * 100) / 100;
  }

  if (ip > 0) {
    const fipConstant = 3.10;
    totals.FIP = Math.round(((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + fipConstant) * 100) / 100;

    const bip = bf - so - bb - hbp;
    if (bip > 0) {
      const expectedHR = bip * 0.035;
      totals.xFIP = Math.round(((13 * expectedHR + 3 * (bb + hbp) - 2 * so) / ip + fipConstant) * 100) / 100;
    }
  }

  // Sum BIP counts for downstream use
  let totalBIP = 0;
  for (const s of statsList) {
    if (typeof s.BIP === 'number') totalBIP += s.BIP;
  }
  if (totalBIP > 0) totals.BIP = totalBIP;

  // Aggregate batted ball stats using BIP-weighted averaging
  const bipWeightedStats = [
    'GB%', 'FB%', 'LD%', 'HR/FB',  // Batted ball stats
  ] as const;

  for (const stat of bipWeightedStats) {
    const weighted = weightedAverageByBIPPitching(statsList, stat);
    if (weighted !== undefined) {
      totals[stat] = weighted;
    }
  }

  // Plate discipline / command stats weighted by IP (only present when pitch-level data is available)
  const ipWeightedStats = [
    'Swing%', 'Contact%', 'CSW%',
  ] as const;

  for (const stat of ipWeightedStats) {
    const weighted = weightedAverageByIP(statsList, stat);
    if (weighted !== undefined) {
      totals[stat] = weighted;
    }
  }

  return totals;
}

// Merge player stats from multiple months
function mergePlayerStats(existing: PlayerStatsData | undefined, newStats: PlayerStatsData): PlayerStatsData {
  if (!existing) return newStats;

  return {
    playerId: existing.playerId,
    season: existing.season,
    lastUpdated: newStats.lastUpdated || existing.lastUpdated,
    type: existing.type,

    // Merge batting data
    batting: existing.batting && newStats.batting
      ? aggregateBattingFromMonthly([existing.batting, newStats.batting])
      : existing.batting || newStats.batting,
    battingByLevel: mergeStatsByLevel(
      existing.battingByLevel,
      newStats.battingByLevel,
      aggregateBattingFromMonthly
    ),
    battingGameLog: mergeGameLogs(existing.battingGameLog, newStats.battingGameLog),

    // Merge pitching data
    pitching: existing.pitching && newStats.pitching
      ? aggregatePitchingFromMonthly([existing.pitching, newStats.pitching])
      : existing.pitching || newStats.pitching,
    pitchingByLevel: mergeStatsByLevel(
      existing.pitchingByLevel,
      newStats.pitchingByLevel,
      aggregatePitchingFromMonthly
    ),
    pitchingGameLog: mergeGameLogs(existing.pitchingGameLog, newStats.pitchingGameLog),
  };
}

// Merge multiple StatsFile objects
function mergeStatsFiles(files: StatsFile[]): StatsFile {
  const result: StatsFile = {};

  for (const file of files) {
    for (const [playerId, playerStats] of Object.entries(file)) {
      result[playerId] = mergePlayerStats(result[playerId], playerStats);
    }
  }

  return result;
}

// Get months needed for a date range
function getMonthsForDateRange(startDate: Date, endDate: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];

  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= end) {
    months.push({ year: current.getFullYear(), month: current.getMonth() + 1 });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

// Public API: Fetch stats for a full season
export async function fetchSeasonStats(year: number): Promise<StatsFile> {
  // Try monthly manifest first
  const manifest = await fetchManifest(year);

  if (manifest && manifest.months.length > 0) {
    // Load all available months and merge
    const monthStats = await Promise.all(
      manifest.months.map(month => fetchMonthStats(year, month))
    );
    return mergeStatsFiles(monthStats);
  }

  // Fall back to legacy single file
  const legacyStats = await fetchLegacyStats(year);
  if (legacyStats) {
    return legacyStats;
  }

  return {};
}

// Public API: Fetch stats for a date range
export async function fetchStatsForDateRange(startDate: Date, endDate: Date): Promise<StatsFile> {
  const neededMonths = getMonthsForDateRange(startDate, endDate);

  if (neededMonths.length === 0) {
    return {};
  }

  // Group by year to check manifests
  const byYear = new Map<number, number[]>();
  for (const { year, month } of neededMonths) {
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year)!.push(month);
  }

  const allStats: StatsFile[] = [];

  for (const [year, months] of byYear) {
    const manifest = await fetchManifest(year);

    if (manifest) {
      // Filter to only available months
      const availableMonths = months.filter(m => manifest.months.includes(m));
      const monthStats = await Promise.all(
        availableMonths.map(month => fetchMonthStats(year, month))
      );
      allStats.push(...monthStats);
    } else {
      // Try legacy file
      const legacyStats = await fetchLegacyStats(year);
      if (legacyStats) {
        allStats.push(legacyStats);
      }
    }
  }

  return mergeStatsFiles(allStats);
}

// Public API: Fetch current season stats (smart detection)
export async function fetchCurrentSeasonStats(): Promise<{ stats: StatsFile; year: number }> {
  const currentYear = new Date().getFullYear();

  // Try current year first
  let stats = await fetchSeasonStats(currentYear);
  if (Object.keys(stats).length > 0) {
    return { stats, year: currentYear };
  }

  // Fall back to previous year
  stats = await fetchSeasonStats(currentYear - 1);
  return { stats, year: currentYear - 1 };
}

// Public API: Clear cache (useful for forcing refresh)
export function clearStatsCache(): void {
  monthlyStatsCache.clear();
  manifestCache.clear();
}

// Public API: Check if monthly data structure is available
export async function hasMonthlyData(year: number): Promise<boolean> {
  const manifest = await fetchManifest(year);
  return manifest !== null && manifest.months.length > 0;
}
