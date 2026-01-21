// types/index.ts

export interface Player {
  mlbId: string;  // Primary identifier (MLB Stats API ID)
  fangraphsId?: string;  // Legacy/optional FanGraphs ID
  name: string;
  team: string;
  org: string;
  level: 'AAA' | 'AA' | 'A+' | 'A' | 'CPX';
  position: string;
  bats?: 'L' | 'R' | 'S';
  throws?: 'L' | 'R';
  age?: number;
  hasStatcast: boolean;
}

// Helper to get the primary ID from a player object (supports both new and legacy)
export function getPlayerId(player: Player | IndexedPlayer): string {
  return player.mlbId || (player as any).fangraphsId || '';
}

export interface Team {
  id: string;
  name: string;
  leagueName?: string;
  platform?: string;
  isWatchlist: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamPlayer {
  id: string;
  teamId: string;
  playerId: string; // mlbId (or fangraphsId for legacy data)
  userNotes?: string;
  addedAt: Date;
}

export interface BattingStats {
  // Counting
  G?: number;
  PA?: number;
  AB?: number;
  H?: number;
  '2B'?: number;
  '3B'?: number;
  HR?: number;
  R?: number;
  RBI?: number;
  BB?: number;
  SO?: number;
  SB?: number;
  CS?: number;
  HBP?: number;
  SF?: number;
  SH?: number;
  GDP?: number;

  // Rate
  AVG?: number;
  OBP?: number;
  SLG?: number;
  OPS?: number;
  ISO?: number;
  'BB%'?: number;
  'K%'?: number;
  BABIP?: number;
  wOBA?: number;
  'wRC+'?: number;

  // Batted Ball
  'GB%'?: number;
  'FB%'?: number;
  'LD%'?: number;
  'Hard%'?: number;

  // Statcast
  EV?: number;
  LA?: number;
  'Barrel%'?: number;
  xBA?: number;
  xSLG?: number;
  xwOBA?: number;
}

export interface PitchingStats {
  // Counting
  G?: number;
  GS?: number;
  W?: number;
  L?: number;
  SV?: number;
  HLD?: number;
  BS?: number;
  IP?: number;
  H?: number;
  R?: number;
  ER?: number;
  HR?: number;
  BB?: number;
  SO?: number;
  HBP?: number;

  // Rate
  ERA?: number;
  WHIP?: number;
  'K/9'?: number;
  'BB/9'?: number;
  'HR/9'?: number;
  'K/BB'?: number;
  'K%'?: number;
  'BB%'?: number;
  FIP?: number;
  xFIP?: number;
  BABIP?: number;

  // Statcast
  Velo?: number;
  SpinRate?: number;
  'Whiff%'?: number;
}

export type MiLBLevel = 'AAA' | 'AA' | 'A+' | 'A' | 'CPX' | 'MiLB';

export interface GameLogEntry {
  date: string;
  gameId?: number;
  opponent?: string;
  team?: string;
  isHome?: boolean;
  level?: MiLBLevel;
  stats: BattingStats | PitchingStats;
}

// Stats by level mapping
export type StatsByLevel<T> = {
  [level in MiLBLevel]?: T;
};

// Stats data format from Python scripts
export interface PlayerStatsData {
  playerId: string;
  season: number;
  lastUpdated: string;
  type: 'batter' | 'pitcher';

  // Batting data (if batter)
  batting?: BattingStats;  // Total MiLB stats
  battingByLevel?: StatsByLevel<BattingStats>;  // Stats broken down by level
  battingSplits?: {
    yesterday?: BattingStats;
    today?: BattingStats;
    last7?: BattingStats;
    last14?: BattingStats;
    last30?: BattingStats;
  };
  battingGameLog?: GameLogEntry[];

  // Pitching data (if pitcher)
  pitching?: PitchingStats;  // Total MiLB stats
  pitchingByLevel?: StatsByLevel<PitchingStats>;  // Stats broken down by level
  pitchingSplits?: {
    yesterday?: PitchingStats;
    today?: PitchingStats;
    last7?: PitchingStats;
    last14?: PitchingStats;
    last30?: PitchingStats;
  };
  pitchingGameLog?: GameLogEntry[];
}

export type Split = 'season' | 'lastSeason' | 'last7' | 'last14' | 'last30' | 'today' | 'yesterday' | 'custom';

export interface CustomDateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface PlayersRegistry {
  players: Player[];
  lastUpdated: string;
}

export interface StatsFile {
  [playerId: string]: PlayerStatsData;
}

export interface MetaData {
  lastUpdated: string;
  playerCount: number;
}

export interface StatcastData {
  lastUpdated: string;
  year: number;
  players: Record<string, any>;
  note?: string;
}

export interface IndexedPlayer {
  mlbId: string;  // Primary identifier
  fangraphsId?: string;  // Legacy/optional
  name: string;
  team: string;
  org: string;
  level: string;
  position: string;
  type: 'batter' | 'pitcher';
  inRegistry: boolean;
}

export interface PlayerIndex {
  players: IndexedPlayer[];
  year: number;
  requestedYear?: number;
  lastUpdated: string;
  count: number;
}
