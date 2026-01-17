// components/SearchNewPlayerModal.tsx
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores/useUIStore';
import type { PlayerIndex, IndexedPlayer, Player, PlayersRegistry } from '../types';

async function fetchPlayerIndex(): Promise<PlayerIndex> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/player-index.json`);
  if (!response.ok) {
    // Return empty index if not found
    return { players: [], year: new Date().getFullYear(), lastUpdated: '', count: 0 };
  }
  return response.json();
}

async function fetchPlayersRegistry(): Promise<PlayersRegistry> {
  const basePath = import.meta.env.VITE_BASE_PATH || '';
  const response = await fetch(`${basePath}/data/players.json`);
  if (!response.ok) throw new Error('Failed to fetch players');
  return response.json();
}

// For local development: save players to localStorage for later syncing
function savePlayerToLocalQueue(player: Omit<Player, 'hasStatcast'>): void {
  const queue = JSON.parse(localStorage.getItem('pendingPlayers') || '[]');
  if (!queue.find((p: Player) => p.fangraphsId === player.fangraphsId)) {
    queue.push({ ...player, hasStatcast: false, addedAt: new Date().toISOString() });
    localStorage.setItem('pendingPlayers', JSON.stringify(queue));
  }
}

function getPendingPlayers(): Player[] {
  return JSON.parse(localStorage.getItem('pendingPlayers') || '[]');
}

function removePendingPlayer(fangraphsId: string): void {
  const queue = getPendingPlayers().filter(p => p.fangraphsId !== fangraphsId);
  localStorage.setItem('pendingPlayers', JSON.stringify(queue));
}

const LEVELS = ['AAA', 'AA', 'A+', 'A', 'CPX'] as const;

const MLB_ORGS = [
  'ARI', 'ATL', 'BAL', 'BOS', 'CHC', 'CHW', 'CIN', 'CLE', 'COL', 'DET',
  'HOU', 'KC', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'OAK',
  'PHI', 'PIT', 'SD', 'SF', 'SEA', 'STL', 'TB', 'TEX', 'TOR', 'WSH'
];

export function SearchNewPlayerModal() {
  const { isSearchNewPlayerModalOpen, closeSearchNewPlayerModal } = useUIStore();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [showAddedPlayers, setShowAddedPlayers] = useState(false);

  // Manual form state
  const [manualPlayer, setManualPlayer] = useState({
    fangraphsId: '',
    name: '',
    team: '',
    org: '',
    level: 'A+' as typeof LEVELS[number],
    position: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch player index (pre-built list of all MiLB players)
  const { data: playerIndex, isLoading: indexLoading } = useQuery({
    queryKey: ['player-index'],
    queryFn: fetchPlayerIndex,
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });

  // Fetch current registry to check for existing players
  const { data: registry } = useQuery({
    queryKey: ['players'],
    queryFn: fetchPlayersRegistry,
  });

  const existingIds = useMemo(() => {
    return new Set(registry?.players?.map(p => p.fangraphsId) || []);
  }, [registry]);

  // Filter players based on search
  const filteredPlayers = useMemo(() => {
    if (!playerIndex?.players || !searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    return playerIndex.players
      .filter(player => {
        // Don't show players already in registry
        if (existingIds.has(player.fangraphsId)) return false;

        return (
          player.name.toLowerCase().includes(query) ||
          player.team.toLowerCase().includes(query) ||
          player.org.toLowerCase().includes(query) ||
          player.position.toLowerCase().includes(query)
        );
      })
      .slice(0, 50); // Limit results
  }, [playerIndex, searchQuery, existingIds]);

  const pendingPlayers = getPendingPlayers();

  const handleAddFromIndex = useCallback((player: IndexedPlayer) => {
    const newPlayer: Omit<Player, 'hasStatcast'> = {
      fangraphsId: player.fangraphsId,
      name: player.name,
      team: player.team,
      org: player.org,
      level: player.level as Player['level'],
      position: player.position,
    };

    savePlayerToLocalQueue(newPlayer);
    setSuccess(`Added ${player.name} to pending list`);
    setTimeout(() => setSuccess(''), 3000);

    // Invalidate queries to refresh the list
    queryClient.invalidateQueries({ queryKey: ['players'] });
  }, [queryClient]);

  const handleAddManual = useCallback(() => {
    setError('');

    // Validate
    if (!manualPlayer.fangraphsId.trim()) {
      setError('FanGraphs ID is required');
      return;
    }
    if (!manualPlayer.name.trim()) {
      setError('Player name is required');
      return;
    }

    // Check if already exists
    if (existingIds.has(manualPlayer.fangraphsId)) {
      setError('Player already exists in registry');
      return;
    }

    const newPlayer: Omit<Player, 'hasStatcast'> = {
      fangraphsId: manualPlayer.fangraphsId.trim(),
      name: manualPlayer.name.trim(),
      team: manualPlayer.team.trim() || 'Unknown',
      org: manualPlayer.org || 'UNK',
      level: manualPlayer.level,
      position: manualPlayer.position.trim() || 'UTIL',
    };

    savePlayerToLocalQueue(newPlayer);
    setSuccess(`Added ${newPlayer.name} to pending list`);

    // Reset form
    setManualPlayer({
      fangraphsId: '',
      name: '',
      team: '',
      org: '',
      level: 'A+',
      position: '',
    });
    setShowManualForm(false);

    setTimeout(() => setSuccess(''), 3000);
  }, [manualPlayer, existingIds]);

  const handleRemovePending = useCallback((fangraphsId: string) => {
    removePendingPlayer(fangraphsId);
    queryClient.invalidateQueries({ queryKey: ['players'] });
    // Force re-render
    setShowAddedPlayers(prev => prev);
  }, [queryClient]);

  const generateGitHubActionUrl = useCallback((_player: Player) => {
    // Generate URL to trigger GitHub Action (users need to be logged in to GitHub)
    const repoUrl = 'https://github.com/comcgovern/MiLB-Tracker'; // Update with actual repo
    return `${repoUrl}/actions/workflows/add-player.yml`;
  }, []);

  const generateCliCommand = useCallback((player: Player) => {
    return `python scripts/add_player.py \\
  --id "${player.fangraphsId}" \\
  --name "${player.name}" \\
  --team "${player.team}" \\
  --org "${player.org}" \\
  --level "${player.level}" \\
  --position "${player.position}" \\
  --fetch-stats`;
  }, []);

  const handleClose = () => {
    setSearchQuery('');
    setShowManualForm(false);
    setShowAddedPlayers(false);
    setError('');
    setSuccess('');
    closeSearchNewPlayerModal();
  };

  if (!isSearchNewPlayerModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Add New Player to Registry
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Search for MiLB players or add them manually by FanGraphs ID
          </p>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { setShowManualForm(false); setShowAddedPlayers(false); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !showManualForm && !showAddedPlayers
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Search Players
            </button>
            <button
              onClick={() => { setShowManualForm(true); setShowAddedPlayers(false); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showManualForm
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Add Manually
            </button>
            <button
              onClick={() => { setShowManualForm(false); setShowAddedPlayers(true); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showAddedPlayers
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Pending ({pendingPlayers.length})
            </button>
          </div>

          {success && (
            <div className="mt-3 p-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-lg text-sm">
              {success}
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {showAddedPlayers ? (
            // Pending players view
            <div>
              {pendingPlayers.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No pending players. Search and add players to see them here.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                      How to add these players:
                    </h3>
                    <ol className="list-decimal list-inside text-sm text-blue-800 dark:text-blue-200 space-y-1">
                      <li>Go to the GitHub repository's Actions tab</li>
                      <li>Select the "Add Player" workflow</li>
                      <li>Click "Run workflow" and enter the player details</li>
                      <li>Or run the CLI command locally if you have the repo cloned</li>
                    </ol>
                  </div>

                  {pendingPlayers.map((player) => (
                    <div
                      key={player.fangraphsId}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {player.name}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
                            {player.position} • {player.org} • {player.level}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemovePending(player.fangraphsId)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="bg-gray-100 dark:bg-gray-800 rounded p-3 font-mono text-xs overflow-x-auto">
                        <pre>{generateCliCommand(player)}</pre>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(generateCliCommand(player))}
                          className="btn-secondary text-sm"
                        >
                          Copy Command
                        </button>
                        <a
                          href={generateGitHubActionUrl(player)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary text-sm"
                        >
                          Open GitHub Action
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : showManualForm ? (
            // Manual add form
            <div className="space-y-4">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Tip:</strong> Find the FanGraphs ID by going to the player's page on
                  FanGraphs. The ID is in the URL (e.g., <code>sa3021456</code> from
                  <code>fangraphs.com/players/player-name/sa3021456/stats</code>)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    FanGraphs ID *
                  </label>
                  <input
                    type="text"
                    value={manualPlayer.fangraphsId}
                    onChange={(e) => setManualPlayer(prev => ({ ...prev, fangraphsId: e.target.value }))}
                    placeholder="e.g., sa3021456"
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Player Name *
                  </label>
                  <input
                    type="text"
                    value={manualPlayer.name}
                    onChange={(e) => setManualPlayer(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., John Smith"
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Team
                  </label>
                  <input
                    type="text"
                    value={manualPlayer.team}
                    onChange={(e) => setManualPlayer(prev => ({ ...prev, team: e.target.value }))}
                    placeholder="e.g., Indianapolis Indians"
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Organization
                  </label>
                  <select
                    value={manualPlayer.org}
                    onChange={(e) => setManualPlayer(prev => ({ ...prev, org: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="">Select...</option>
                    {MLB_ORGS.map(org => (
                      <option key={org} value={org}>{org}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Level
                  </label>
                  <select
                    value={manualPlayer.level}
                    onChange={(e) => setManualPlayer(prev => ({ ...prev, level: e.target.value as typeof LEVELS[number] }))}
                    className="input w-full"
                  >
                    {LEVELS.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Position
                  </label>
                  <input
                    type="text"
                    value={manualPlayer.position}
                    onChange={(e) => setManualPlayer(prev => ({ ...prev, position: e.target.value }))}
                    placeholder="e.g., SS, RHP, OF"
                    className="input w-full"
                  />
                </div>
              </div>

              <button
                onClick={handleAddManual}
                className="btn-primary w-full"
              >
                Add to Pending List
              </button>
            </div>
          ) : (
            // Search view
            <div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, team, org, or position..."
                className="input w-full mb-4"
                autoFocus
              />

              {indexLoading ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  Loading player index...
                </div>
              ) : !searchQuery.trim() ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  Enter a search term to find players
                </div>
              ) : filteredPlayers.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <p>No players found matching "{searchQuery}"</p>
                  <button
                    onClick={() => setShowManualForm(true)}
                    className="text-primary-600 dark:text-primary-400 hover:underline mt-2"
                  >
                    Add player manually
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {filteredPlayers.length} players found
                    {filteredPlayers.length === 50 && ' (showing first 50)'}
                  </div>

                  {filteredPlayers.map((player) => (
                    <div
                      key={player.fangraphsId}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {player.name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            player.type === 'pitcher'
                              ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
                              : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          }`}>
                            {player.type === 'pitcher' ? 'P' : 'B'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          {player.position} • {player.org || 'UNK'} • {player.level} • {player.team}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                          ID: {player.fangraphsId}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddFromIndex(player)}
                        className="btn-primary text-sm"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            className="btn-secondary w-full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
