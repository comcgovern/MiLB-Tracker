// types/index.ts

export interface Player {
  fangraphsId: string;
  mlbamId?: string;
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
  playerId: string; // fangraphsId
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
  IP?: number;
  H?: number;
  R?: number;
  ER?: number;
  HR?: number;
  BB?: number;
  SO?: number;

  // Rate
  ERA?: number;
  WHIP?: number;
  'K/9'?: number;
  'BB/9'?: number;
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

export interface PlayerStatsData {
  type: 'batter' | 'pitcher';
  season: BattingStats | PitchingStats;
  splits: {
    yesterday?: BattingStats | PitchingStats;
    today?: BattingStats | PitchingStats;
    last7?: BattingStats | PitchingStats;
    last14?: BattingStats | PitchingStats;
    last30?: BattingStats | PitchingStats;
  };
  games: GameLog[];
}

export interface GameLog {
  Date: string;
  Team: string;
  Opp: string;
  // ... varies by batter/pitcher
  [key: string]: any;
}

export type Split = 'season' | 'last7' | 'last14' | 'last30' | 'today' | 'yesterday';

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
  batters: Record<string, any>;
  pitchers: Record<string, any>;
}
