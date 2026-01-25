// hooks/useTeamPlayers.ts
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { DBTeamPlayer } from '../db';

export interface TeamPlayerOperationResult {
  success: boolean;
  error?: string;
  id?: string;
}

export function useTeamPlayers(teamId?: string | null) {
  const teamPlayers = useLiveQuery(
    () => teamId ? db.teamPlayers.where('teamId').equals(teamId).toArray() : [],
    [teamId]
  );

  const addPlayerToTeam = async (
    teamId: string,
    playerId: string,
    userNotes?: string
  ): Promise<TeamPlayerOperationResult> => {
    try {
      if (!teamId) {
        return { success: false, error: 'Team ID is required' };
      }
      if (!playerId) {
        return { success: false, error: 'Player ID is required' };
      }

      // Check if player already exists in this team
      const existing = await db.teamPlayers
        .where(['teamId', 'playerId'])
        .equals([teamId, playerId])
        .first();

      if (existing) {
        return { success: false, error: 'Player is already on this team' };
      }

      const newTeamPlayer: DBTeamPlayer = {
        teamId,
        playerId,
        userNotes,
        addedAt: new Date(),
      };

      const id = await db.teamPlayers.add(newTeamPlayer);
      return { success: true, id: String(id) };
    } catch (error) {
      console.error('Failed to add player to team:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add player to team',
      };
    }
  };

  const removePlayerFromTeam = async (
    teamPlayerId: string
  ): Promise<TeamPlayerOperationResult> => {
    try {
      if (!teamPlayerId) {
        return { success: false, error: 'Team player ID is required' };
      }

      await db.teamPlayers.delete(teamPlayerId);
      return { success: true };
    } catch (error) {
      console.error('Failed to remove player from team:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove player from team',
      };
    }
  };

  const updatePlayerNotes = async (
    teamPlayerId: string,
    notes: string
  ): Promise<TeamPlayerOperationResult> => {
    try {
      if (!teamPlayerId) {
        return { success: false, error: 'Team player ID is required' };
      }

      await db.teamPlayers.update(teamPlayerId, { userNotes: notes });
      return { success: true };
    } catch (error) {
      console.error('Failed to update player notes:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update player notes',
      };
    }
  };

  const bulkAddPlayers = async (
    teamId: string,
    playerIds: string[]
  ): Promise<TeamPlayerOperationResult> => {
    try {
      if (!teamId) {
        return { success: false, error: 'Team ID is required' };
      }
      if (!playerIds || playerIds.length === 0) {
        return { success: false, error: 'Player IDs are required' };
      }

      // Filter out players already on this team
      const existingPlayers = await db.teamPlayers
        .where('teamId')
        .equals(teamId)
        .toArray();
      const existingPlayerIds = new Set(existingPlayers.map(p => p.playerId));

      const newPlayerIds = playerIds.filter(id => !existingPlayerIds.has(id));

      if (newPlayerIds.length === 0) {
        return { success: false, error: 'All players are already on this team' };
      }

      const teamPlayersToAdd: DBTeamPlayer[] = newPlayerIds.map(playerId => ({
        teamId,
        playerId,
        addedAt: new Date(),
      }));

      await db.teamPlayers.bulkAdd(teamPlayersToAdd);
      return { success: true };
    } catch (error) {
      console.error('Failed to bulk add players:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add players to team',
      };
    }
  };

  return {
    teamPlayers,
    addPlayerToTeam,
    removePlayerFromTeam,
    updatePlayerNotes,
    bulkAddPlayers,
  };
}
