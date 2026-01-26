// hooks/useTeamPlayers.ts
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { DBTeamPlayer } from '../db';

export interface TeamPlayerOperationResult {
  success: boolean;
  error?: string;
  id?: string;
}

export type SortOption = 'custom' | 'name-asc' | 'name-desc' | 'level-asc' | 'level-desc';

// Level order for sorting (highest to lowest)
const LEVEL_SORT_ORDER: Record<string, number> = {
  'AAA': 1,
  'AA': 2,
  'A+': 3,
  'A': 4,
  'CPX': 5,
};

export function useTeamPlayers(teamId?: string | null) {
  // Query players sorted by displayOrder
  const teamPlayers = useLiveQuery(
    () => teamId
      ? db.teamPlayers
          .where('teamId')
          .equals(teamId)
          .sortBy('displayOrder')
      : [],
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

      // Get the max displayOrder for this team
      const existingPlayers = await db.teamPlayers
        .where('teamId')
        .equals(teamId)
        .toArray();
      const maxOrder = existingPlayers.length > 0
        ? Math.max(...existingPlayers.map(p => p.displayOrder || 0))
        : 0;

      const newTeamPlayer: DBTeamPlayer = {
        teamId,
        playerId,
        userNotes,
        displayOrder: maxOrder + 1,
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

      // Get the max displayOrder for this team
      const maxOrder = existingPlayers.length > 0
        ? Math.max(...existingPlayers.map(p => p.displayOrder || 0))
        : 0;

      const teamPlayersToAdd: DBTeamPlayer[] = newPlayerIds.map((playerId, index) => ({
        teamId,
        playerId,
        displayOrder: maxOrder + index + 1,
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

  // Reorder a single player (move from one position to another)
  const reorderPlayer = async (
    teamPlayerId: string,
    newIndex: number
  ): Promise<TeamPlayerOperationResult> => {
    try {
      if (!teamId) {
        return { success: false, error: 'Team ID is required' };
      }

      // Get all players for this team sorted by current order
      const players = await db.teamPlayers
        .where('teamId')
        .equals(teamId)
        .sortBy('displayOrder');

      // Find the player being moved
      const currentIndex = players.findIndex(p => p.id === teamPlayerId);
      if (currentIndex === -1) {
        return { success: false, error: 'Player not found' };
      }

      // Reorder the array
      const [movedPlayer] = players.splice(currentIndex, 1);
      players.splice(newIndex, 0, movedPlayer);

      // Update all displayOrder values
      await db.transaction('rw', db.teamPlayers, async () => {
        for (let i = 0; i < players.length; i++) {
          await db.teamPlayers.update(players[i].id!, { displayOrder: i + 1 });
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to reorder player:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reorder player',
      };
    }
  };

  // Reorder all players in the team (for batch updates after drag-and-drop)
  const reorderPlayers = async (
    orderedPlayerIds: string[]
  ): Promise<TeamPlayerOperationResult> => {
    try {
      if (!teamId) {
        return { success: false, error: 'Team ID is required' };
      }

      // Update displayOrder for each player
      await db.transaction('rw', db.teamPlayers, async () => {
        for (let i = 0; i < orderedPlayerIds.length; i++) {
          await db.teamPlayers.update(orderedPlayerIds[i], { displayOrder: i + 1 });
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to reorder players:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reorder players',
      };
    }
  };

  // Sort players by name or level
  const sortPlayers = async (
    sortOption: SortOption,
    playerInfoMap: Map<string, { name: string; level: string }>
  ): Promise<TeamPlayerOperationResult> => {
    try {
      if (!teamId) {
        return { success: false, error: 'Team ID is required' };
      }

      if (sortOption === 'custom') {
        return { success: true }; // No sorting needed for custom order
      }

      // Get all players for this team
      const players = await db.teamPlayers
        .where('teamId')
        .equals(teamId)
        .toArray();

      // Sort based on option
      players.sort((a, b) => {
        const infoA = playerInfoMap.get(a.playerId);
        const infoB = playerInfoMap.get(b.playerId);

        if (!infoA || !infoB) return 0;

        switch (sortOption) {
          case 'name-asc':
            return infoA.name.localeCompare(infoB.name);
          case 'name-desc':
            return infoB.name.localeCompare(infoA.name);
          case 'level-asc': {
            const levelA = LEVEL_SORT_ORDER[infoA.level] || 999;
            const levelB = LEVEL_SORT_ORDER[infoB.level] || 999;
            return levelB - levelA; // Lower level first (A before AAA)
          }
          case 'level-desc': {
            const levelA = LEVEL_SORT_ORDER[infoA.level] || 999;
            const levelB = LEVEL_SORT_ORDER[infoB.level] || 999;
            return levelA - levelB; // Higher level first (AAA before A)
          }
          default:
            return 0;
        }
      });

      // Update displayOrder for each player
      await db.transaction('rw', db.teamPlayers, async () => {
        for (let i = 0; i < players.length; i++) {
          await db.teamPlayers.update(players[i].id!, { displayOrder: i + 1 });
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to sort players:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sort players',
      };
    }
  };

  return {
    teamPlayers,
    addPlayerToTeam,
    removePlayerFromTeam,
    updatePlayerNotes,
    bulkAddPlayers,
    reorderPlayer,
    reorderPlayers,
    sortPlayers,
  };
}
