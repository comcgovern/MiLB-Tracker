// hooks/useTeamPlayers.ts
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { DBTeamPlayer } from '../db';

export function useTeamPlayers(teamId?: string | null) {
  const teamPlayers = useLiveQuery(
    () => teamId ? db.teamPlayers.where('teamId').equals(teamId).toArray() : [],
    [teamId]
  );

  const addPlayerToTeam = async (teamId: string, playerId: string, userNotes?: string) => {
    // Check if player already exists in this team
    const existing = await db.teamPlayers
      .where(['teamId', 'playerId'])
      .equals([teamId, playerId])
      .first();

    if (existing) {
      throw new Error('Player is already on this team');
    }

    const newTeamPlayer: DBTeamPlayer = {
      teamId,
      playerId,
      userNotes,
      addedAt: new Date(),
    };

    const id = await db.teamPlayers.add(newTeamPlayer);
    return id;
  };

  const removePlayerFromTeam = async (teamPlayerId: string) => {
    await db.teamPlayers.delete(teamPlayerId);
  };

  const updatePlayerNotes = async (teamPlayerId: string, notes: string) => {
    await db.teamPlayers.update(teamPlayerId, { userNotes: notes });
  };

  const bulkAddPlayers = async (teamId: string, playerIds: string[]) => {
    const teamPlayers: DBTeamPlayer[] = playerIds.map(playerId => ({
      teamId,
      playerId,
      addedAt: new Date(),
    }));

    await db.teamPlayers.bulkAdd(teamPlayers);
  };

  return {
    teamPlayers,
    addPlayerToTeam,
    removePlayerFromTeam,
    updatePlayerNotes,
    bulkAddPlayers,
  };
}
