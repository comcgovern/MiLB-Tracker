// hooks/useTeams.ts
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { DBTeam } from '../db';

export interface TeamOperationResult {
  success: boolean;
  error?: string;
  id?: string;
}

export function useTeams() {
  const teams = useLiveQuery(() =>
    db.teams.orderBy('displayOrder').toArray()
  );

  const addTeam = async (
    name: string,
    leagueName?: string,
    platform?: string,
    isWatchlist = false
  ): Promise<TeamOperationResult> => {
    try {
      if (!name || name.trim() === '') {
        return { success: false, error: 'Team name is required' };
      }

      const maxOrder = teams?.reduce((max, team) => Math.max(max, team.displayOrder), -1) ?? -1;

      const newTeam: DBTeam = {
        name: name.trim(),
        leagueName,
        platform,
        isWatchlist,
        displayOrder: maxOrder + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const id = await db.teams.add(newTeam);
      return { success: true, id: String(id) };
    } catch (error) {
      console.error('Failed to add team:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add team',
      };
    }
  };

  const updateTeam = async (
    id: string,
    updates: Partial<DBTeam>
  ): Promise<TeamOperationResult> => {
    try {
      if (!id) {
        return { success: false, error: 'Team ID is required' };
      }

      await db.teams.update(id, {
        ...updates,
        updatedAt: new Date(),
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to update team:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update team',
      };
    }
  };

  const deleteTeam = async (id: string): Promise<TeamOperationResult> => {
    try {
      if (!id) {
        return { success: false, error: 'Team ID is required' };
      }

      // Delete all players associated with this team
      await db.teamPlayers.where('teamId').equals(id).delete();
      // Delete the team
      await db.teams.delete(id);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete team:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete team',
      };
    }
  };

  const reorderTeams = async (teamIds: string[]): Promise<TeamOperationResult> => {
    try {
      if (!teamIds || teamIds.length === 0) {
        return { success: false, error: 'Team IDs are required' };
      }

      const updates = teamIds.map((id, index) =>
        db.teams.update(id, { displayOrder: index })
      );
      await Promise.all(updates);
      return { success: true };
    } catch (error) {
      console.error('Failed to reorder teams:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reorder teams',
      };
    }
  };

  return {
    teams,
    addTeam,
    updateTeam,
    deleteTeam,
    reorderTeams,
  };
}
