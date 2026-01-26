// components/PlayerDetailModal.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Player, GameLogEntry, BattingStats, PitchingStats } from '../types';
import { formatStatValue } from '../config/statCategories';
import { fetchCurrentSeasonStats } from '../utils/statsService';
import { PlayerCharts } from './PlayerCharts';
import { useLeagueAverages } from '../hooks/useLeagueAverages';
import {
  calculateAllSituationalSplits,
  hasHomeAwayData,
  hasOpponentHandData,
  getSituationalSplitGameCounts,
} from '../utils/statsCalculator';

interface PlayerDetailModalProps {
  player: Player | null;
  onClose: () => void;
}

type TabId = 'gamelog' | 'charts' | 'splits' | 'info';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'gamelog', label: 'Game Log' },
  { id: 'charts', label: 'Charts' },
  { id: 'splits', label: 'Splits' },
  { id: 'info', label: 'More Info' },
];

export function PlayerDetailModal({ player, onClose }: PlayerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('gamelog');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchCurrentSeasonStats,
  });
  const statsData = data?.stats;

  if (!player) return null;

  const playerId = player.mlbId || player.fangraphsId;
  const playerStats = statsData?.[playerId || ''];
  const isBatter = playerStats?.type === 'batter' || !!playerStats?.batting;
  const gameLog = isBatter ? playerStats?.battingGameLog : playerStats?.pitchingGameLog;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="card max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {player.name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {player.position} • {player.org} • {player.level} • {player.team}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Season summary */}
          {playerStats && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Season Totals
              </h3>
              <div className="flex flex-wrap gap-4 text-sm">
                {isBatter && playerStats.batting && (
                  <>
                    <span><strong>{playerStats.batting.G || 0}</strong> G</span>
                    <span><strong>{playerStats.batting.PA || 0}</strong> PA</span>
                    <span><strong>{formatStatValue(playerStats.batting.AVG, 'decimal3')}</strong> AVG</span>
                    <span><strong>{formatStatValue(playerStats.batting.OBP, 'decimal3')}</strong> OBP</span>
                    <span><strong>{formatStatValue(playerStats.batting.SLG, 'decimal3')}</strong> SLG</span>
                    <span><strong>{playerStats.batting.HR || 0}</strong> HR</span>
                    <span><strong>{playerStats.batting.RBI || 0}</strong> RBI</span>
                    <span><strong>{playerStats.batting.SB || 0}</strong> SB</span>
                  </>
                )}
                {!isBatter && playerStats.pitching && (
                  <>
                    <span><strong>{playerStats.pitching.G || 0}</strong> G</span>
                    <span><strong>{playerStats.pitching.IP || 0}</strong> IP</span>
                    <span><strong>{formatStatValue(playerStats.pitching.ERA, 'decimal2')}</strong> ERA</span>
                    <span><strong>{formatStatValue(playerStats.pitching.WHIP, 'decimal2')}</strong> WHIP</span>
                    <span><strong>{playerStats.pitching.SO || 0}</strong> K</span>
                    <span><strong>{playerStats.pitching.W || 0}-{playerStats.pitching.L || 0}</strong> W-L</span>
                    <span><strong>{playerStats.pitching.SV || 0}</strong> SV</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="mt-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-lg ${
                  activeTab === tab.id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-b-2 border-primary-600'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'gamelog' && (
            <GameLogTab
              isLoading={isLoading}
              isError={isError}
              gameLog={gameLog}
              isBatter={isBatter}
            />
          )}
          {activeTab === 'charts' && (
            <ChartsTab
              gameLog={gameLog}
              isBatter={isBatter}
              showLeagueAverages={true}
            />
          )}
          {activeTab === 'splits' && (
            <SplitsTab
              gameLog={gameLog}
              isBatter={isBatter}
            />
          )}
          {activeTab === 'info' && (
            <MoreInfoTab player={player} />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="btn-secondary w-full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Game Log Tab Component
interface GameLogTabProps {
  isLoading: boolean;
  isError: boolean;
  gameLog: GameLogEntry[] | undefined;
  isBatter: boolean;
}

function GameLogTab({ isLoading, isError, gameLog, isBatter }: GameLogTabProps) {
  // Batting columns
  const battingColumns: { key: string; label: string; format?: 'decimal3' | 'decimal2' }[] = [
    { key: 'AB', label: 'AB' },
    { key: 'H', label: 'H' },
    { key: 'R', label: 'R' },
    { key: 'RBI', label: 'RBI' },
    { key: 'HR', label: 'HR' },
    { key: 'BB', label: 'BB' },
    { key: 'SO', label: 'K' },
    { key: 'SB', label: 'SB' },
    { key: 'AVG', label: 'AVG', format: 'decimal3' },
  ];

  // Pitching columns
  const pitchingColumns: { key: string; label: string; format?: 'decimal3' | 'decimal2' }[] = [
    { key: 'IP', label: 'IP' },
    { key: 'H', label: 'H' },
    { key: 'R', label: 'R' },
    { key: 'ER', label: 'ER' },
    { key: 'BB', label: 'BB' },
    { key: 'SO', label: 'K' },
    { key: 'HR', label: 'HR' },
    { key: 'ERA', label: 'ERA', format: 'decimal2' },
  ];

  const columns = isBatter ? battingColumns : pitchingColumns;

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        Loading game log...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 dark:text-red-400">Failed to load game log</p>
      </div>
    );
  }

  // Filter to current season and sort newest first
  const currentYear = new Date().getFullYear();
  const filteredGameLog = gameLog
    ?.filter((game) => {
      const gameYear = new Date(game.date).getFullYear();
      return gameYear === currentYear;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (!filteredGameLog || filteredGameLog.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        No game log data available for current season
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Opp
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {filteredGameLog.map((game, index) => (
            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                {formatGameDate(game.date)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                {game.isHome === false && '@'}{game.opponent || '--'}
              </td>
              {columns.map((col) => {
                const value = game.stats?.[col.key as keyof typeof game.stats];
                return (
                  <td
                    key={col.key}
                    className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white"
                  >
                    {col.format
                      ? formatStatValue(value as number, col.format)
                      : (value ?? '--')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Charts Tab Component
interface ChartsTabProps {
  gameLog: GameLogEntry[] | undefined;
  isBatter: boolean;
  showLeagueAverages?: boolean;
}

function ChartsTab({ gameLog, isBatter, showLeagueAverages }: ChartsTabProps) {
  const { leagueAverages } = useLeagueAverages();

  if (!gameLog || gameLog.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        No game data available for charts
      </div>
    );
  }

  return (
    <div className="p-6">
      <PlayerCharts
        gameLog={gameLog}
        isBatter={isBatter}
        leagueAverages={showLeagueAverages ? leagueAverages : null}
      />
    </div>
  );
}

// Splits Tab Component
interface SplitsTabProps {
  gameLog: GameLogEntry[] | undefined;
  isBatter: boolean;
}

function SplitsTab({ gameLog, isBatter }: SplitsTabProps) {
  const type = isBatter ? 'batting' : 'pitching';
  const splits = calculateAllSituationalSplits(gameLog, type);
  const gameCounts = getSituationalSplitGameCounts(gameLog);
  const hasHomeAway = hasHomeAwayData(gameLog);
  const hasHandedness = hasOpponentHandData(gameLog);

  // Batting stat columns for splits
  const battingColumns: { key: keyof BattingStats; label: string; format?: 'decimal3' | 'decimal2' | 'percent' }[] = [
    { key: 'G', label: 'G' },
    { key: 'PA', label: 'PA' },
    { key: 'AVG', label: 'AVG', format: 'decimal3' },
    { key: 'OBP', label: 'OBP', format: 'decimal3' },
    { key: 'SLG', label: 'SLG', format: 'decimal3' },
    { key: 'OPS', label: 'OPS', format: 'decimal3' },
    { key: 'HR', label: 'HR' },
    { key: 'BB%', label: 'BB%', format: 'percent' },
    { key: 'K%', label: 'K%', format: 'percent' },
    { key: 'wOBA', label: 'wOBA', format: 'decimal3' },
  ];

  // Pitching stat columns for splits
  const pitchingColumns: { key: keyof PitchingStats; label: string; format?: 'decimal3' | 'decimal2' | 'percent' }[] = [
    { key: 'G', label: 'G' },
    { key: 'IP', label: 'IP', format: 'decimal2' },
    { key: 'ERA', label: 'ERA', format: 'decimal2' },
    { key: 'WHIP', label: 'WHIP', format: 'decimal2' },
    { key: 'K/9', label: 'K/9', format: 'decimal2' },
    { key: 'BB/9', label: 'BB/9', format: 'decimal2' },
    { key: 'K%', label: 'K%', format: 'percent' },
    { key: 'BB%', label: 'BB%', format: 'percent' },
    { key: 'FIP', label: 'FIP', format: 'decimal2' },
  ];

  const columns = isBatter ? battingColumns : pitchingColumns;

  const formatValue = (value: number | undefined, format?: string): string => {
    if (value === undefined || value === null) return '--';
    if (format === 'decimal3') return value.toFixed(3).replace(/^0/, '');
    if (format === 'decimal2') return value.toFixed(2);
    if (format === 'percent') return (value * 100).toFixed(1) + '%';
    return String(value);
  };

  const renderStatsRow = (
    label: string,
    stats: BattingStats | PitchingStats | undefined,
    gameCount: number
  ) => (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
        {label}
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({gameCount} G)</span>
      </td>
      {columns.map((col) => {
        const value = stats?.[col.key as keyof typeof stats] as number | undefined;
        return (
          <td
            key={col.key}
            className="px-3 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white"
          >
            {formatValue(value, col.format)}
          </td>
        );
      })}
    </tr>
  );

  if (!gameLog || gameLog.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        No game data available for splits
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Home/Away Splits */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Home / Away Splits
        </h3>
        {hasHomeAway ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Split
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {renderStatsRow('Home', splits.home, gameCounts.home)}
                {renderStatsRow('Away', splits.away, gameCounts.away)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Home/away data not available for this player's games.
          </p>
        )}
      </div>

      {/* vs L/R Splits */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          {isBatter ? 'vs Pitcher Handedness' : 'vs Batter Handedness'}
        </h3>
        {hasHandedness ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Split
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {renderStatsRow('vs Left', splits.vsL, gameCounts.vsL)}
                {renderStatsRow('vs Right', splits.vsR, gameCounts.vsR)}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Opponent handedness data not available yet. This feature requires additional data collection.
          </p>
        )}
      </div>
    </div>
  );
}

// More Info Tab Component (placeholder)
interface MoreInfoTabProps {
  player: Player;
}

function MoreInfoTab({ player }: MoreInfoTabProps) {
  return (
    <div className="p-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Player Information
        </h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Name:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{player.name}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Position:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{player.position}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Team:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{player.team}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Organization:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{player.org}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Level:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{player.level}</span>
          </div>
          {player.age && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Age:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{player.age}</span>
            </div>
          )}
          {player.bats && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Bats:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{player.bats}</span>
            </div>
          )}
          {player.throws && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Throws:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{player.throws}</span>
            </div>
          )}
        </div>

        {/* External Links - placeholder for future implementation */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            External Links
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Links to FanGraphs, MLB.com, and prospect rankings coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatGameDate(dateString: string): string {
  if (!dateString) return '--';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}
