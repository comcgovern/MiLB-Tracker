// types/dashboard.ts
// Types for the Performance Dashboard

import type { Player, GameLogEntry, BattingStats, PitchingStats, MiLBLevel } from './index';

// A player entry in a leaderboard
export interface LeaderboardEntry {
  player: Player;
  teamName: string;          // User's team name
  gameLog?: GameLogEntry;    // For yesterday's stats
  stats?: BattingStats | PitchingStats;  // For aggregated stats
  value: number | string;    // The primary display value
  displayValue: string;      // Formatted display string
  subValue?: string;         // Secondary info (e.g., "Norfolk (AAA)")
}

// A player with a streak
export interface StreakEntry {
  player: Player;
  teamName: string;
  streakLength: number;
  streakType: 'hitting' | 'onBase' | 'scoreless' | 'hitless';
  displayValue: string;
}

// A player promotion
export interface PromotionEntry {
  player: Player;
  teamName: string;
  previousLevel: MiLBLevel;
  newLevel: MiLBLevel;
  debutDate: string;
  debutGame: GameLogEntry;
  displayValue: string;
}

// Leaderboard card configuration
export interface LeaderboardConfig {
  id: string;
  title: string;
  emoji: string;
  type: 'batting' | 'pitching' | 'both';
  timeframe: 'yesterday' | 'last7' | 'streak' | 'promotion';
  description?: string;
}

// All dashboard data
export interface DashboardData {
  // Yesterday
  homeRuns: LeaderboardEntry[];
  perfectDays: LeaderboardEntry[];
  rbiKings: LeaderboardEntry[];
  punchouts: LeaderboardEntry[];
  qualityStarts: LeaderboardEntry[];
  saves: LeaderboardEntry[];

  // Hot 7 Days
  hottestBats: LeaderboardEntry[];
  powerSurge: LeaderboardEntry[];
  speedDemons: LeaderboardEntry[];
  lightsOut: LeaderboardEntry[];
  kLeaders: LeaderboardEntry[];
  whipKings: LeaderboardEntry[];

  // Plate Discipline
  bestEyes: LeaderboardEntry[];
  contactKings: LeaderboardEntry[];

  // Pitching Command
  commandAces: LeaderboardEntry[];
  bestKBB: LeaderboardEntry[];

  // Cold & Struggling
  iceCold: LeaderboardEntry[];
  hitlessStreaks: StreakEntry[];
  roughStretch: LeaderboardEntry[];

  // Streaks
  hittingStreaks: StreakEntry[];
  onBaseStreaks: StreakEntry[];
  scorelessStreaks: StreakEntry[];

  // Promotions
  levelDebuts: PromotionEntry[];

  // Statcast (placeholder)
  maxExitVelo: LeaderboardEntry[];
  barrelLeaders: LeaderboardEntry[];

  // Meta
  yesterdayDate: string;
  hasYesterdayGames: boolean;
}

// Dashboard section configuration
export interface DashboardSection {
  id: string;
  title: string;
  cards: LeaderboardConfig[];
}

// Define all dashboard sections
export const DASHBOARD_SECTIONS: DashboardSection[] = [
  {
    id: 'yesterday',
    title: 'Yesterday',
    cards: [
      { id: 'homeRuns', title: 'Home Runs', emoji: '💣', type: 'batting', timeframe: 'yesterday' },
      { id: 'perfectDays', title: 'Perfect Days', emoji: '✨', type: 'batting', timeframe: 'yesterday' },
      { id: 'rbiKings', title: 'RBI Kings', emoji: '💥', type: 'batting', timeframe: 'yesterday' },
      { id: 'punchouts', title: 'Punchouts', emoji: '⚡', type: 'pitching', timeframe: 'yesterday' },
      { id: 'qualityStarts', title: 'Quality Starts', emoji: '🏆', type: 'pitching', timeframe: 'yesterday' },
      { id: 'saves', title: 'Saves', emoji: '💾', type: 'pitching', timeframe: 'yesterday' },
    ],
  },
  {
    id: 'hot7days',
    title: 'Hot - Last 7 Days',
    cards: [
      { id: 'hottestBats', title: 'Hottest Bats', emoji: '🔥', type: 'batting', timeframe: 'last7' },
      { id: 'powerSurge', title: 'Power Surge', emoji: '💪', type: 'batting', timeframe: 'last7' },
      { id: 'speedDemons', title: 'Speed Demons', emoji: '🏃', type: 'batting', timeframe: 'last7' },
      { id: 'lightsOut', title: 'Lights Out', emoji: '🎯', type: 'pitching', timeframe: 'last7' },
      { id: 'kLeaders', title: 'K Leaders', emoji: '🌀', type: 'pitching', timeframe: 'last7' },
      { id: 'whipKings', title: 'WHIP Kings', emoji: '🔒', type: 'pitching', timeframe: 'last7' },
    ],
  },
  {
    id: 'discipline',
    title: 'Discipline & Command',
    cards: [
      { id: 'bestEyes', title: 'Best Eyes', emoji: '👁️', type: 'batting', timeframe: 'last7' },
      { id: 'contactKings', title: 'Contact Kings', emoji: '🎯', type: 'batting', timeframe: 'last7' },
      { id: 'commandAces', title: 'Command Aces', emoji: '🎮', type: 'pitching', timeframe: 'last7' },
      { id: 'bestKBB', title: 'Best K/BB', emoji: '⚖️', type: 'pitching', timeframe: 'last7' },
    ],
  },
  {
    id: 'streaks',
    title: 'Streaks',
    cards: [
      { id: 'hittingStreaks', title: 'Hitting Streaks', emoji: '🔥', type: 'batting', timeframe: 'streak' },
      { id: 'onBaseStreaks', title: 'On-Base Streaks', emoji: '📈', type: 'batting', timeframe: 'streak' },
      { id: 'scorelessStreaks', title: 'Scoreless Streaks', emoji: '🚫', type: 'pitching', timeframe: 'streak' },
    ],
  },
  {
    id: 'cold',
    title: 'Cold & Struggling',
    cards: [
      { id: 'iceCold', title: 'Ice Cold', emoji: '🧊', type: 'batting', timeframe: 'last7' },
      { id: 'hitlessStreaks', title: 'Hitless Streaks', emoji: '😶', type: 'batting', timeframe: 'streak' },
      { id: 'roughStretch', title: 'Rough Stretch', emoji: '📉', type: 'pitching', timeframe: 'last7' },
    ],
  },
  {
    id: 'promotions',
    title: 'Promotions',
    cards: [
      { id: 'levelDebuts', title: 'Level Debuts', emoji: '🆕', type: 'both', timeframe: 'promotion' },
    ],
  },
  {
    id: 'statcast',
    title: 'Statcast',
    cards: [
      { id: 'maxExitVelo', title: 'Max Exit Velo', emoji: '⚡', type: 'batting', timeframe: 'last7', description: 'Coming Soon' },
      { id: 'barrelLeaders', title: 'Barrel Leaders', emoji: '🛢️', type: 'batting', timeframe: 'last7', description: 'Coming Soon' },
    ],
  },
];
