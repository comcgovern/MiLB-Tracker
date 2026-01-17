// components/AddTeamModal.tsx
import { useState } from 'react';
import { useUIStore } from '../stores/useUIStore';
import { useTeams } from '../hooks/useTeams';

export function AddTeamModal() {
  const { isAddTeamModalOpen, closeAddTeamModal, setActiveTeamId } = useUIStore();
  const { addTeam } = useTeams();

  const [name, setName] = useState('');
  const [leagueName, setLeagueName] = useState('');
  const [platform, setPlatform] = useState('');
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Team name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const teamId = await addTeam(
        name.trim(),
        leagueName.trim() || undefined,
        platform.trim() || undefined,
        isWatchlist
      );

      // Set the new team as active
      setActiveTeamId(String(teamId));

      // Reset form and close modal
      setName('');
      setLeagueName('');
      setPlatform('');
      setIsWatchlist(false);
      closeAddTeamModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    setLeagueName('');
    setPlatform('');
    setIsWatchlist(false);
    setError('');
    closeAddTeamModal();
  };

  if (!isAddTeamModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Add New Team
        </h2>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Team Name */}
            <div>
              <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Team Name *
              </label>
              <input
                id="team-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input w-full"
                placeholder="e.g., My Dynasty Team"
                required
                autoFocus
              />
            </div>

            {/* League Name */}
            <div>
              <label htmlFor="league-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                League Name
              </label>
              <input
                id="league-name"
                type="text"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className="input w-full"
                placeholder="e.g., NFBC Main Event"
              />
            </div>

            {/* Platform */}
            <div>
              <label htmlFor="platform" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Platform
              </label>
              <input
                id="platform"
                type="text"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="input w-full"
                placeholder="e.g., Fantrax, Yahoo, ESPN"
              />
            </div>

            {/* Is Watchlist */}
            <div className="flex items-center">
              <input
                id="is-watchlist"
                type="checkbox"
                checked={isWatchlist}
                onChange={(e) => setIsWatchlist(e.target.checked)}
                className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="is-watchlist" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                This is a watchlist
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Adding...' : 'Add Team'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="btn-secondary flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
