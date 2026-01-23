// utils/dashboardCalculations.ts
// Pure functions for calculating dashboard leaderboards

import type {
  Player,
  GameLogEntry,
  BattingStats,
  PitchingStats,
  PlayerStatsData,
  MiLBLevel,
} from '../types';
import type { LeaderboardEntry, StreakEntry, PromotionEntry } from '../types/dashboard';
import {
  getPresetDateRange,
  filterGameLogsByDateRange,
  aggregateBattingStats,
  aggregatePitchingStats,
  LEVEL_ORDER,
} from './statsCalculator';

// Get yesterday's date in YYYY-MM-DD format
export function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Format date for display
export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get game log entry for a specific date
export function getGameForDate(
  gameLogs: GameLogEntry[] | undefined,
  date: string
): GameLogEntry | undefined {
  if (!gameLogs) return undefined;
  return gameLogs.find(g => g.date === date);
}

// Get all games for the last N days
export function getGamesForLastNDays(
  gameLogs: GameLogEntry[] | undefined,
  days: number
): GameLogEntry[] {
  if (!gameLogs) return [];

  const range = getPresetDateRange(days === 7 ? 'last7' : days === 14 ? 'last14' : 'last30');
  if (!range) return [];

  return filterGameLogsByDateRange(gameLogs, range);
}

// Calculate hitting streak (consecutive games with at least 1 hit)
export function calculateHittingStreak(gameLogs: GameLogEntry[] | undefined): number {
  if (!gameLogs || gameLogs.length === 0) return 0;

  // Sort by date descending (most recent first)
  const sorted = [...gameLogs].sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  for (const game of sorted) {
    const stats = game.stats as BattingStats;
    const pa = stats.PA || 0;
    const h = stats.H || 0;

    // Skip games with less than 1 PA (didn't really play)
    if (pa < 1) continue;

    if (h >= 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Calculate on-base streak (consecutive games reaching base)
export function calculateOnBaseStreak(gameLogs: GameLogEntry[] | undefined): number {
  if (!gameLogs || gameLogs.length === 0) return 0;

  const sorted = [...gameLogs].sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  for (const game of sorted) {
    const stats = game.stats as BattingStats;
    const pa = stats.PA || 0;
    const h = stats.H || 0;
    const bb = stats.BB || 0;
    const hbp = stats.HBP || 0;

    if (pa < 1) continue;

    if (h + bb + hbp >= 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Calculate hitless streak (consecutive games with 0 hits)
export function calculateHitlessStreak(gameLogs: GameLogEntry[] | undefined): number {
  if (!gameLogs || gameLogs.length === 0) return 0;

  const sorted = [...gameLogs].sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  for (const game of sorted) {
    const stats = game.stats as BattingStats;
    const ab = stats.AB || 0;
    const h = stats.H || 0;

    // Must have at-bats to count
    if (ab < 1) continue;

    if (h === 0) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// Calculate scoreless streak (consecutive appearances with 0 ER)
export function calculateScorelessStreak(gameLogs: GameLogEntry[] | undefined): { games: number; innings: number } {
  if (!gameLogs || gameLogs.length === 0) return { games: 0, innings: 0 };

  const sorted = [...gameLogs].sort((a, b) => b.date.localeCompare(a.date));

  let games = 0;
  let innings = 0;

  for (const game of sorted) {
    const stats = game.stats as PitchingStats;
    const ip = stats.IP || 0;
    const er = stats.ER || 0;

    if (ip < 0.1) continue;

    if (er === 0) {
      games++;
      innings += ip;
    } else {
      break;
    }
  }

  return { games, innings: Math.round(innings * 10) / 10 };
}

// Detect level promotion (first game at a higher level)
export function detectPromotion(
  gameLogs: GameLogEntry[] | undefined,
  daysBack: number = 7
): { previousLevel: MiLBLevel; newLevel: MiLBLevel; debutDate: string; debutGame: GameLogEntry } | null {
  if (!gameLogs || gameLogs.length < 2) return null;

  const sorted = [...gameLogs].sort((a, b) => a.date.localeCompare(b.date));

  // Find the cutoff date
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Find levels before the cutoff
  const levelsBefore = new Set<MiLBLevel>();
  for (const game of sorted) {
    if (game.date < cutoffStr && game.level) {
      levelsBefore.add(game.level);
    }
  }

  if (levelsBefore.size === 0) return null;

  // Find the highest level before cutoff
  let highestBefore: MiLBLevel | null = null;
  for (const level of LEVEL_ORDER) {
    if (levelsBefore.has(level)) {
      highestBefore = level;
      break;
    }
  }

  if (!highestBefore) return null;

  // Find first game at a higher level after cutoff
  const higherLevels = LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(highestBefore));

  for (const game of sorted) {
    if (game.date >= cutoffStr && game.level && higherLevels.includes(game.level)) {
      // Check if this is their first game ever at this level
      const priorGamesAtLevel = sorted.filter(
        g => g.date < game.date && g.level === game.level
      );

      if (priorGamesAtLevel.length === 0) {
        return {
          previousLevel: highestBefore,
          newLevel: game.level,
          debutDate: game.date,
          debutGame: game,
        };
      }
    }
  }

  return null;
}

// Format batting line (e.g., "2-for-4, 1 HR, 2 RBI")
export function formatBattingLine(stats: BattingStats): string {
  const parts: string[] = [];

  const h = stats.H || 0;
  const ab = stats.AB || 0;
  parts.push(`${h}-for-${ab}`);

  if (stats.HR && stats.HR > 0) parts.push(`${stats.HR} HR`);
  if (stats.RBI && stats.RBI > 0) parts.push(`${stats.RBI} RBI`);
  if (stats['2B'] && stats['2B'] > 0) parts.push(`${stats['2B']} 2B`);
  if (stats['3B'] && stats['3B'] > 0) parts.push(`${stats['3B']} 3B`);
  if (stats.SB && stats.SB > 0) parts.push(`${stats.SB} SB`);

  return parts.join(', ');
}

// Format pitching line (e.g., "7 IP, 10 K, 2 ER")
export function formatPitchingLine(stats: PitchingStats): string {
  const parts: string[] = [];

  if (stats.IP) parts.push(`${stats.IP} IP`);
  if (stats.SO) parts.push(`${stats.SO} K`);
  if (stats.ER !== undefined) parts.push(`${stats.ER} ER`);
  if (stats.BB) parts.push(`${stats.BB} BB`);

  return parts.join(', ');
}

// Format slash line (AVG/OBP/SLG)
export function formatSlashLine(stats: BattingStats): string {
  const avg = stats.AVG !== undefined ? stats.AVG.toFixed(3).replace(/^0/, '') : '---';
  const obp = stats.OBP !== undefined ? stats.OBP.toFixed(3).replace(/^0/, '') : '---';
  const slg = stats.SLG !== undefined ? stats.SLG.toFixed(3).replace(/^0/, '') : '---';
  return `${avg}/${obp}/${slg}`;
}

// Format team and level subvalue
export function formatTeamLevel(player: Player): string {
  return `${player.team} (${player.level})`;
}

// Sort and limit leaderboard entries
export function sortAndLimit<T>(
  entries: T[],
  sortFn: (a: T, b: T) => number,
  limit: number = 5
): T[] {
  return [...entries].sort(sortFn).slice(0, limit);
}

// ============================================
// LEADERBOARD CALCULATION FUNCTIONS
// ============================================

interface PlayerWithContext {
  player: Player;
  teamName: string;
  stats: PlayerStatsData;
}

// Yesterday: Home Runs
export function calculateHomeRuns(
  players: PlayerWithContext[],
  yesterdayDate: string
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const game = getGameForDate(stats.battingGameLog, yesterdayDate);
    if (!game) continue;

    const batting = game.stats as BattingStats;
    const hr = batting.HR || 0;

    // HR always qualifies regardless of PA
    if (hr >= 1) {
      entries.push({
        player,
        teamName,
        gameLog: game,
        value: hr,
        displayValue: `${hr} HR`,
        subValue: formatTeamLevel(player),
      });
    }
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// Yesterday: Perfect Days (4+ AB, all hits)
export function calculatePerfectDays(
  players: PlayerWithContext[],
  yesterdayDate: string
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const game = getGameForDate(stats.battingGameLog, yesterdayDate);
    if (!game) continue;

    const batting = game.stats as BattingStats;
    const ab = batting.AB || 0;
    const h = batting.H || 0;

    if (ab >= 4 && h === ab) {
      entries.push({
        player,
        teamName,
        gameLog: game,
        value: ab,
        displayValue: `${h}-for-${ab}`,
        subValue: formatTeamLevel(player),
      });
    }
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// Yesterday: RBI Kings (3+ RBI)
export function calculateRbiKings(
  players: PlayerWithContext[],
  yesterdayDate: string
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const game = getGameForDate(stats.battingGameLog, yesterdayDate);
    if (!game) continue;

    const batting = game.stats as BattingStats;
    const rbi = batting.RBI || 0;
    const pa = batting.PA || 0;

    // Filter pinch hitters unless HR
    if (pa < 3 && !batting.HR) continue;

    if (rbi >= 3) {
      entries.push({
        player,
        teamName,
        gameLog: game,
        value: rbi,
        displayValue: `${rbi} RBI`,
        subValue: formatTeamLevel(player),
      });
    }
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// Yesterday: Punchouts (6+ K)
export function calculatePunchouts(
  players: PlayerWithContext[],
  yesterdayDate: string
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const game = getGameForDate(stats.pitchingGameLog, yesterdayDate);
    if (!game) continue;

    const pitching = game.stats as PitchingStats;
    const so = pitching.SO || 0;

    if (so >= 6) {
      entries.push({
        player,
        teamName,
        gameLog: game,
        value: so,
        displayValue: `${so} K`,
        subValue: formatTeamLevel(player),
      });
    }
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// Yesterday: Quality Starts
export function calculateQualityStarts(
  players: PlayerWithContext[],
  yesterdayDate: string
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const game = getGameForDate(stats.pitchingGameLog, yesterdayDate);
    if (!game) continue;

    const pitching = game.stats as PitchingStats;
    const gs = pitching.GS || 0;
    const ip = pitching.IP || 0;
    const er = pitching.ER || 0;

    if (gs >= 1 && ip >= 6 && er <= 3) {
      entries.push({
        player,
        teamName,
        gameLog: game,
        value: ip,
        displayValue: `${ip} IP, ${er} ER`,
        subValue: formatTeamLevel(player),
      });
    }
  }

  return sortAndLimit(entries, (a, b) => {
    // Sort by IP desc, then ER asc
    const ipDiff = (b.value as number) - (a.value as number);
    if (ipDiff !== 0) return ipDiff;
    const aER = (a.gameLog?.stats as PitchingStats).ER || 0;
    const bER = (b.gameLog?.stats as PitchingStats).ER || 0;
    return aER - bER;
  });
}

// Yesterday: Saves
export function calculateSaves(
  players: PlayerWithContext[],
  yesterdayDate: string
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const game = getGameForDate(stats.pitchingGameLog, yesterdayDate);
    if (!game) continue;

    const pitching = game.stats as PitchingStats;
    const sv = pitching.SV || 0;

    if (sv >= 1) {
      entries.push({
        player,
        teamName,
        gameLog: game,
        value: sv,
        displayValue: formatPitchingLine(pitching),
        subValue: formatTeamLevel(player),
      });
    }
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// 7 Days: Hottest Bats (by OPS, min 15 PA)
export function calculateHottestBats(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const games = getGamesForLastNDays(stats.battingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregateBattingStats(games);
    if (!agg) continue;

    const pa = agg.PA || 0;
    if (pa < 15) continue;

    const ops = agg.OPS || 0;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: ops,
      displayValue: formatSlashLine(agg),
      subValue: formatTeamLevel(player),
    });
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// 7 Days: Power Surge (2+ HR)
export function calculatePowerSurge(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const games = getGamesForLastNDays(stats.battingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregateBattingStats(games);
    if (!agg) continue;

    const hr = agg.HR || 0;
    if (hr < 2) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: hr,
      displayValue: `${hr} HR`,
      subValue: formatTeamLevel(player),
    });
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// 7 Days: Speed Demons (2+ SB)
export function calculateSpeedDemons(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const games = getGamesForLastNDays(stats.battingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregateBattingStats(games);
    if (!agg) continue;

    const sb = agg.SB || 0;
    if (sb < 2) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: sb,
      displayValue: `${sb} SB`,
      subValue: formatTeamLevel(player),
    });
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// 7 Days: Lights Out (ERA <= 2.50, 8+ IP)
export function calculateLightsOut(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const games = getGamesForLastNDays(stats.pitchingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregatePitchingStats(games);
    if (!agg) continue;

    const ip = agg.IP || 0;
    const era = agg.ERA;

    if (ip < 8 || era === undefined || era > 2.50) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: era,
      displayValue: `${era.toFixed(2)} ERA`,
      subValue: `${ip} IP`,
    });
  }

  return sortAndLimit(entries, (a, b) => (a.value as number) - (b.value as number));
}

// 7 Days: K Leaders (8+ IP)
export function calculateKLeaders(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const games = getGamesForLastNDays(stats.pitchingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregatePitchingStats(games);
    if (!agg) continue;

    const ip = agg.IP || 0;
    const so = agg.SO || 0;

    if (ip < 8) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: so,
      displayValue: `${so} K`,
      subValue: `${ip} IP`,
    });
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// 7 Days: WHIP Kings (WHIP <= 1.00, 8+ IP)
export function calculateWhipKings(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const games = getGamesForLastNDays(stats.pitchingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregatePitchingStats(games);
    if (!agg) continue;

    const ip = agg.IP || 0;
    const whip = agg.WHIP;

    if (ip < 8 || whip === undefined || whip > 1.00) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: whip,
      displayValue: `${whip.toFixed(2)} WHIP`,
      subValue: `${ip} IP`,
    });
  }

  return sortAndLimit(entries, (a, b) => (a.value as number) - (b.value as number));
}

// 7 Days: Best Eyes (BB% >= 12%, 15+ PA)
export function calculateBestEyes(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const games = getGamesForLastNDays(stats.battingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregateBattingStats(games);
    if (!agg) continue;

    const pa = agg.PA || 0;
    const bbPct = agg['BB%'];

    if (pa < 15 || bbPct === undefined || bbPct < 0.12) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: bbPct,
      displayValue: `${(bbPct * 100).toFixed(1)}% BB`,
      subValue: formatTeamLevel(player),
    });
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// 7 Days: Contact Kings (K% <= 15%, 15+ PA)
export function calculateContactKings(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const games = getGamesForLastNDays(stats.battingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregateBattingStats(games);
    if (!agg) continue;

    const pa = agg.PA || 0;
    const kPct = agg['K%'];

    if (pa < 15 || kPct === undefined || kPct > 0.15) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: kPct,
      displayValue: `${(kPct * 100).toFixed(1)}% K`,
      subValue: formatTeamLevel(player),
    });
  }

  return sortAndLimit(entries, (a, b) => (a.value as number) - (b.value as number));
}

// 7 Days: Command Aces (BB/9 <= 2.0, 8+ IP)
export function calculateCommandAces(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const games = getGamesForLastNDays(stats.pitchingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregatePitchingStats(games);
    if (!agg) continue;

    const ip = agg.IP || 0;
    const bb9 = agg['BB/9'];

    if (ip < 8 || bb9 === undefined || bb9 > 2.0) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: bb9,
      displayValue: `${bb9.toFixed(1)} BB/9`,
      subValue: `${ip} IP`,
    });
  }

  return sortAndLimit(entries, (a, b) => (a.value as number) - (b.value as number));
}

// 7 Days: Best K/BB (K/BB >= 3.0, 8+ IP)
export function calculateBestKBB(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const games = getGamesForLastNDays(stats.pitchingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregatePitchingStats(games);
    if (!agg) continue;

    const ip = agg.IP || 0;
    const kbb = agg['K/BB'];

    if (ip < 8 || kbb === undefined || kbb < 3.0) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: kbb,
      displayValue: `${kbb.toFixed(2)} K/BB`,
      subValue: `${ip} IP`,
    });
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// 7 Days: Ice Cold (OBP < .200, 15+ PA)
export function calculateIceCold(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const games = getGamesForLastNDays(stats.battingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregateBattingStats(games);
    if (!agg) continue;

    const pa = agg.PA || 0;
    const obp = agg.OBP;

    if (pa < 15 || obp === undefined || obp >= 0.200) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: obp,
      displayValue: `${obp.toFixed(3)} OBP`,
      subValue: formatTeamLevel(player),
    });
  }

  return sortAndLimit(entries, (a, b) => (a.value as number) - (b.value as number));
}

// 7 Days: Rough Stretch (ERA >= 6.00, 8+ IP)
export function calculateRoughStretch(players: PlayerWithContext[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const games = getGamesForLastNDays(stats.pitchingGameLog, 7);
    if (games.length === 0) continue;

    const agg = aggregatePitchingStats(games);
    if (!agg) continue;

    const ip = agg.IP || 0;
    const era = agg.ERA;

    if (ip < 8 || era === undefined || era < 6.00) continue;

    entries.push({
      player,
      teamName,
      stats: agg,
      value: era,
      displayValue: `${era.toFixed(2)} ERA`,
      subValue: `${ip} IP`,
    });
  }

  return sortAndLimit(entries, (a, b) => (b.value as number) - (a.value as number));
}

// Streaks: Hitting Streaks (5+ games)
export function calculateHittingStreaks(players: PlayerWithContext[]): StreakEntry[] {
  const entries: StreakEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const streak = calculateHittingStreak(stats.battingGameLog);
    if (streak < 5) continue;

    entries.push({
      player,
      teamName,
      streakLength: streak,
      streakType: 'hitting',
      displayValue: `${streak} games`,
    });
  }

  return sortAndLimit(entries, (a, b) => b.streakLength - a.streakLength);
}

// Streaks: On-Base Streaks (5+ games)
export function calculateOnBaseStreaks(players: PlayerWithContext[]): StreakEntry[] {
  const entries: StreakEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const streak = calculateOnBaseStreak(stats.battingGameLog);
    if (streak < 5) continue;

    entries.push({
      player,
      teamName,
      streakLength: streak,
      streakType: 'onBase',
      displayValue: `${streak} games`,
    });
  }

  return sortAndLimit(entries, (a, b) => b.streakLength - a.streakLength);
}

// Streaks: Hitless Streaks (5+ games)
export function calculateHitlessStreaks(players: PlayerWithContext[]): StreakEntry[] {
  const entries: StreakEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'batter') continue;

    const streak = calculateHitlessStreak(stats.battingGameLog);
    if (streak < 5) continue;

    entries.push({
      player,
      teamName,
      streakLength: streak,
      streakType: 'hitless',
      displayValue: `${streak} games`,
    });
  }

  return sortAndLimit(entries, (a, b) => b.streakLength - a.streakLength);
}

// Streaks: Scoreless Streaks (5+ appearances)
export function calculateScorelessStreaks(players: PlayerWithContext[]): StreakEntry[] {
  const entries: StreakEntry[] = [];

  for (const { player, teamName, stats } of players) {
    if (stats.type !== 'pitcher') continue;

    const { games, innings } = calculateScorelessStreak(stats.pitchingGameLog);
    if (games < 5) continue;

    entries.push({
      player,
      teamName,
      streakLength: games,
      streakType: 'scoreless',
      displayValue: `${innings} IP`,
    });
  }

  return sortAndLimit(entries, (a, b) => b.streakLength - a.streakLength);
}

// Promotions: Level Debuts
export function calculateLevelDebuts(players: PlayerWithContext[]): PromotionEntry[] {
  const entries: PromotionEntry[] = [];

  for (const { player, teamName, stats } of players) {
    const gameLogs = stats.type === 'batter' ? stats.battingGameLog : stats.pitchingGameLog;
    const promotion = detectPromotion(gameLogs);

    if (!promotion) continue;

    const debutStats = stats.type === 'batter'
      ? formatBattingLine(promotion.debutGame.stats as BattingStats)
      : formatPitchingLine(promotion.debutGame.stats as PitchingStats);

    entries.push({
      player,
      teamName,
      previousLevel: promotion.previousLevel,
      newLevel: promotion.newLevel,
      debutDate: promotion.debutDate,
      debutGame: promotion.debutGame,
      displayValue: debutStats,
    });
  }

  // Sort by debut date (most recent first)
  return entries.sort((a, b) => b.debutDate.localeCompare(a.debutDate)).slice(0, 5);
}
