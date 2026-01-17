// hooks/useTeams.ts
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { DBTeam } from '../db';

export function useTeams() {
  const teams = useLiveQuery(() =>
    db.teams.orderBy('displayOrder').toArray()
  );

  const addTeam = async (name: string, leagueName?: string, platform?: string, isWatchlist = false) => {
    const maxOrder = teams?.reduce((max, team) => Math.max(max, team.displayOrder), -1) ?? -1;

    const newTeam: DBTeam = {
      name,
      leagueName,
      platform,
      isWatchlist,
      displayOrder: maxOrder + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const id = await db.teams.add(newTeam);
    return id;
  };

  const updateTeam = async (id: string, updates: Partial<DBTeam>) => {
    await db.teams.update(id, {
      ...updates,
      updatedAt: new Date(),
    });
  };

  const deleteTeam = async (id: string) => {
    // Delete all players associated with this team
    await db.teamPlayers.where('teamId').equals(id).delete();
    // Delete the team
    await db.teams.delete(id);
  };

  const reorderTeams = async (teamIds: string[]) => {
    const updates = teamIds.map((id, index) =>
      db.teams.update(id, { displayOrder: index })
    );
    await Promise.all(updates);
  };

  return {
    teams,
    addTeam,
    updateTeam,
    deleteTeam,
    reorderTeams,
  };
}
