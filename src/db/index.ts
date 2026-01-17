// db/index.ts
import Dexie, { type EntityTable } from 'dexie';

export interface DBTeam {
  id?: string;
  name: string;
  leagueName?: string;
  platform?: string;
  isWatchlist: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DBTeamPlayer {
  id?: string;
  teamId: string;
  playerId: string;
  userNotes?: string;
  addedAt: Date;
}

export interface DBSettings {
  key: string;
  value: any;
}

export class MiLBDatabase extends Dexie {
  teams!: EntityTable<DBTeam, 'id'>;
  teamPlayers!: EntityTable<DBTeamPlayer, 'id'>;
  settings!: EntityTable<DBSettings, 'key'>;

  constructor() {
    super('milb-stats-tracker');

    this.version(1).stores({
      teams: '++id, name, isWatchlist, displayOrder',
      teamPlayers: '++id, teamId, playerId, [teamId+playerId]',
      settings: 'key',
    });
  }
}

export const db = new MiLBDatabase();
