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
  displayOrder: number;
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

    // Version 2: Add displayOrder to teamPlayers for drag-and-drop reordering
    this.version(2).stores({
      teams: '++id, name, isWatchlist, displayOrder',
      teamPlayers: '++id, teamId, playerId, displayOrder, [teamId+playerId]',
      settings: 'key',
    }).upgrade(tx => {
      // Set displayOrder based on addedAt order for existing entries
      return tx.table('teamPlayers').toCollection().modify((player, ref) => {
        // Use timestamp as initial order, will be normalized later
        ref.value.displayOrder = player.addedAt?.getTime() || Date.now();
      });
    });
  }
}

export const db = new MiLBDatabase();
