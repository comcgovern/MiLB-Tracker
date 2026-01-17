// components/AddPlayerModal.tsx
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '../stores/useUIStore';
import { useTeamPlayers } from '../hooks/useTeamPlayers';
import type { PlayersRegistry } from '../types';

async function fetchPlayers(): Promise<PlayersRegistry> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/players.json`);
  if (!response.ok) throw new Error('Failed to fetch players');
  return response.json();
}

export function AddPlayerModal() {
  const { isAddPlayerModalOpen, closeAddPlayerModal, activeTeamId, openSearchNewPlayerModal } = useUIStore();
  const { teamPlayers, addPlayerToTeam } = useTeamPlayers(activeTeamId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available players
  const { data: playersRegistry, isLoading } = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayers,
  });

  // Filter available players based on search and already added
  const availablePlayers = useMemo(() => {
    if (!playersRegistry?.players) return [];

    const existingPlayerIds = new Set(teamPlayers?.map(tp => tp.playerId) || []);

    return playersRegistry.players.filter(player => {
      // Filter out players already on this team
      if (existingPlayerIds.has(player.fangraphsId)) return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          player.name.toLowerCase().includes(query) ||
          player.org.toLowerCase().includes(query) ||
          player.position.toLowerCase().includes(query) ||
          player.level.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [playersRegistry, teamPlayers, searchQuery]);

  const handleTogglePlayer = (playerId: string) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleSelectAll = () => {
    setSelectedPlayers(availablePlayers.map(p => p.fangraphsId));
  };

  const handleDeselectAll = () => {
    setSelectedPlayers([]);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Add Players to Team
          </h2>

          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, org, position, or level..."
            className="input w-full"
            autoFocus
          />

          {/* Selection controls */}
          <div className="flex items-center justify-between mt-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {selectedPlayers.length} selected • {availablePlayers.length} available
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

          {error && (
            <div className="mt-3 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Link to add new player to registry */}
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Can't find a player?{' '}
              <button
                type="button"
                onClick={() => {
                  closeAddPlayerModal();
                  openSearchNewPlayerModal();
                }}
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                Add a new player to the registry
              </button>
            </span>
          </div>
        </div>

        {/* Player List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              Loading players...
            </div>
          ) : availablePlayers.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              {searchQuery.trim() ? 'No players found matching your search.' : 'No players available to add.'}
            </div>
          ) : (
            <div className="space-y-2">
              {availablePlayers.map((player) => (
                <label
                  key={player.fangraphsId}
                  className={`
                    flex items-center p-3 rounded-lg border cursor-pointer transition-colors
                    ${
                      selectedPlayers.includes(player.fangraphsId)
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlayers.includes(player.fangraphsId)}
                    onChange={() => handleTogglePlayer(player.fangraphsId)}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {player.name}
                      </span>
                      {player.hasStatcast && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                          SC
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                      {player.position} • {player.org} • {player.level} • {player.team}
                    </div>
                  </div>
                </label>
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
