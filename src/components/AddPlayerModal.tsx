// components/AddPlayerModal.tsx
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import type { PlayerIndex, IndexedPlayer } from '../types';
import { getPlayerId } from '../types';

async function fetchPlayerIndex(): Promise<PlayerIndex> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/player-index.json`);
  if (!response.ok) {
    // Return empty index if not found
    return { players: [], year: new Date().getFullYear(), lastUpdated: '', count: 0 };
  }
  return response.json();
}

export function AddPlayerModal() {
  const { isAddPlayerModalOpen, closeAddPlayerModal, activeTeamId } = useUIStore();
  const { teamPlayers, addPlayerToTeam } = useTeamPlayers(activeTeamId);
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch player index (all MiLB players)
  const { data: playerIndex, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['player-index'],
    queryFn: fetchPlayerIndex,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // Filter available players based on search and already added
  const filteredPlayers = useMemo(() => {
    if (!playerIndex?.players) return [];

    const existingPlayerIds = new Set(teamPlayers?.map(tp => tp.playerId) || []);

    // If no search query, return empty (require search to show results)
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    return playerIndex.players
      .filter(player => {
        // Filter out players already on this team
        if (existingPlayerIds.has(getPlayerId(player))) return false;

        // Filter by search query
        return (
          player.name.toLowerCase().includes(query) ||
          player.team.toLowerCase().includes(query) ||
          player.org.toLowerCase().includes(query) ||
          player.position.toLowerCase().includes(query) ||
          player.level.toLowerCase().includes(query)
        );
      })
      .slice(0, 50); // Limit results for performance
  }, [playerIndex, teamPlayers, searchQuery]);

  const handleTogglePlayer = (playerId: string) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleSelectAll = () => {
    setSelectedPlayers(filteredPlayers.map(p => getPlayerId(p)));
  };

  const handleDeselectAll = () => {
    setSelectedPlayers([]);
  };

  const handleRefreshIndex = async () => {
    await refetch();
  };

  const handleSubmit = async () => {
    if (!activeTeamId) {
      setError('No team selected');
      return;
    }

    if (selectedPlayers.length === 0) {
      setError('Please select at least one player');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Add each selected player to the team
      for (const playerId of selectedPlayers) {
        await addPlayerToTeam(activeTeamId, playerId);
      }

      // Invalidate queries to refresh the player list
      queryClient.invalidateQueries({ queryKey: ['player-index'] });

      // Reset and close
      setSelectedPlayers([]);
      setSearchQuery('');
      closeAddPlayerModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add players');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedPlayers([]);
    setSearchQuery('');
    setError('');
    closeAddPlayerModal();
  };

  if (!isAddPlayerModalOpen) return null;

  const lastUpdated = playerIndex?.lastUpdated
    ? new Date(playerIndex.lastUpdated).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Add Players to Team
            </h2>

            {/* Refresh button and last updated */}
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Index updated: {lastUpdated}
                </span>
              )}
              <button
                type="button"
                onClick={handleRefreshIndex}
                disabled={isFetching}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh player index"
              >
                <svg
                  className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, team, org, position, or level..."
            className="input w-full"
            autoFocus
          />

          {/* Selection controls */}
          {searchQuery.trim() && filteredPlayers.length > 0 && (
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedPlayers.length} selected • {filteredPlayers.length} found
                {filteredPlayers.length === 50 && ' (showing first 50)'}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Select All
                </button>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Player List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mb-2" />
              <p>Loading player index...</p>
            </div>
          ) : playerIndex && playerIndex.players.length === 0 ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                Player Index Not Available
              </h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-4">
                The player index is empty or hasn't been built yet. It should be built automatically weekly.
              </p>
              <button
                onClick={handleRefreshIndex}
                className="btn-primary text-sm"
              >
                Try Refreshing
              </button>
            </div>
          ) : !searchQuery.trim() ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <p>Enter a search term to find players</p>
              <p className="text-sm mt-1">
                {playerIndex?.count?.toLocaleString() || 0} MiLB players available
              </p>
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No players found matching "{searchQuery}"
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPlayers.map((player) => (
                <PlayerRow
                  key={getPlayerId(player)}
                  player={player}
                  isSelected={selectedPlayers.includes(getPlayerId(player))}
                  onToggle={() => handleTogglePlayer(getPlayerId(player))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || selectedPlayers.length === 0}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding...' : `Add ${selectedPlayers.length} Player${selectedPlayers.length !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={handleClose}
              className="btn-secondary flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({
  player,
  isSelected,
  onToggle,
}: {
  player: IndexedPlayer;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`
        flex items-center p-3 rounded-lg border cursor-pointer transition-colors
        ${
          isSelected
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
        }
      `}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
      />
      <div className="ml-3 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white">
            {player.name}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              player.type === 'pitcher'
                ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
                : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
            }`}
          >
            {player.type === 'pitcher' ? 'P' : 'B'}
          </span>
          {player.inRegistry && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
              Has Stats
            </span>
          )}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
          {player.position} • {player.org} • {player.level} • {player.team}
        </div>
      </div>
    </label>
  );
}
