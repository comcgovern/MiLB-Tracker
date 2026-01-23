// components/Dashboard/Dashboard.tsx
import { useDashboardData } from '../../hooks/useDashboardData';
import { useUIStore } from '../../stores/useUIStore';
import { DashboardCard } from './DashboardCard';
import { formatDisplayDate } from '../../utils/dashboardCalculations';
import type { Player } from '../../types';

export function Dashboard() {
  const { data, isLoading, hasTeams, hasPlayers } = useDashboardData();
  const { openGameLog, openAddTeamModal, openAddPlayerModal } = useUIStore();

  const handlePlayerClick = (player: Player) => {
    openGameLog(player);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">Loading dashboard...</p>
      </div>
    );
  }

  // No teams state
  if (!hasTeams) {
    return (
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Welcome to MiLB Tracker
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Create a team to start tracking your prospects.
        </p>
        <button
          onClick={openAddTeamModal}
          className="btn btn-primary"
        >
          Create Your First Team
        </button>
      </div>
    );
  }

  // No players state
  if (!hasPlayers) {
    return (
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">👤</div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Add Some Players
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Add players to your teams to see their performance highlights.
        </p>
        <button
          onClick={openAddPlayerModal}
          className="btn btn-primary"
        >
          Add Players
        </button>
      </div>
    );
  }

  // No data yet
  if (!data) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No performance data available.
        </p>
      </div>
    );
  }

  const yesterdayDisplay = formatDisplayDate(data.yesterdayDate);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          📊 Performance Dashboard
        </h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Updated daily
        </span>
      </div>

      {/* Yesterday Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          Yesterday
          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
            {yesterdayDisplay}
          </span>
        </h2>
        {!data.hasYesterdayGames ? (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
            No games yesterday or no qualifying performances
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <DashboardCard
              title="Home Runs"
              emoji="💣"
              entries={data.homeRuns}
              type="leaderboard"
              onPlayerClick={handlePlayerClick}
            />
            <DashboardCard
              title="Perfect Days"
              emoji="✨"
              entries={data.perfectDays}
              type="leaderboard"
              onPlayerClick={handlePlayerClick}
            />
            <DashboardCard
              title="RBI Kings"
              emoji="💥"
              entries={data.rbiKings}
              type="leaderboard"
              onPlayerClick={handlePlayerClick}
            />
            <DashboardCard
              title="Punchouts"
              emoji="⚡"
              entries={data.punchouts}
              type="leaderboard"
              onPlayerClick={handlePlayerClick}
            />
            <DashboardCard
              title="Quality Starts"
              emoji="🏆"
              entries={data.qualityStarts}
              type="leaderboard"
              onPlayerClick={handlePlayerClick}
            />
            <DashboardCard
              title="Saves"
              emoji="💾"
              entries={data.saves}
              type="leaderboard"
              onPlayerClick={handlePlayerClick}
            />
          </div>
        )}
      </section>

      {/* Hot 7 Days Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          🔥 Hot - Last 7 Days
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <DashboardCard
            title="Hottest Bats"
            emoji="🔥"
            entries={data.hottestBats}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Power Surge"
            emoji="💪"
            entries={data.powerSurge}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Speed Demons"
            emoji="🏃"
            entries={data.speedDemons}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Lights Out"
            emoji="🎯"
            entries={data.lightsOut}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="K Leaders"
            emoji="🌀"
            entries={data.kLeaders}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="WHIP Kings"
            emoji="🔒"
            entries={data.whipKings}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
        </div>
      </section>

      {/* Discipline & Command Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          🎯 Discipline & Command
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <DashboardCard
            title="Best Eyes"
            emoji="👁️"
            entries={data.bestEyes}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Contact Kings"
            emoji="🎯"
            entries={data.contactKings}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Command Aces"
            emoji="🎮"
            entries={data.commandAces}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Best K/BB"
            emoji="⚖️"
            entries={data.bestKBB}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
        </div>
      </section>

      {/* Streaks Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          🔥 Streaks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <DashboardCard
            title="Hitting Streaks"
            emoji="🔥"
            entries={data.hittingStreaks}
            type="streak"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="On-Base Streaks"
            emoji="📈"
            entries={data.onBaseStreaks}
            type="streak"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Scoreless Streaks"
            emoji="🚫"
            entries={data.scorelessStreaks}
            type="streak"
            onPlayerClick={handlePlayerClick}
          />
        </div>
      </section>

      {/* Cold & Struggling Section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          ❄️ Cold & Struggling
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <DashboardCard
            title="Ice Cold"
            emoji="🧊"
            entries={data.iceCold}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Hitless Streaks"
            emoji="😶"
            entries={data.hitlessStreaks}
            type="streak"
            onPlayerClick={handlePlayerClick}
          />
          <DashboardCard
            title="Rough Stretch"
            emoji="📉"
            entries={data.roughStretch}
            type="leaderboard"
            onPlayerClick={handlePlayerClick}
          />
        </div>
      </section>

      {/* Promotions Section */}
      {data.levelDebuts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            📈 Promotions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardCard
              title="Level Debuts"
              emoji="🆕"
              entries={data.levelDebuts}
              type="promotion"
              onPlayerClick={handlePlayerClick}
            />
          </div>
        </section>
      )}

      {/* Statcast Section (Placeholder) */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          ⚡ Statcast
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <DashboardCard
            title="Max Exit Velo"
            emoji="⚡"
            entries={[]}
            type="leaderboard"
            placeholder
            placeholderText="Coming Soon"
          />
          <DashboardCard
            title="Barrel Leaders"
            emoji="🛢️"
            entries={[]}
            type="leaderboard"
            placeholder
            placeholderText="Coming Soon"
          />
        </div>
      </section>
    </div>
  );
}
