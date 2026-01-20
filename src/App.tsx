import { useEffect } from 'react';
import { useSettingsStore } from './stores/useSettingsStore';
import { useUIStore } from './stores/useUIStore';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { Controls } from './components/Controls';
import { StatsTable } from './components/StatsTable';
import { AddTeamModal } from './components/AddTeamModal';
import { AddPlayerModal } from './components/AddPlayerModal';
import { DateRangeModal } from './components/DateRangeModal';
import { SearchNewPlayerModal } from './components/SearchNewPlayerModal';
import { GameLogModal } from './components/GameLogModal';

function App() {
  const { darkMode } = useSettingsStore();
  const { isDateRangeModalOpen, closeDateRangeModal, setCustomDateRange, gameLogPlayer, closeGameLog } = useUIStore();

  // Apply dark mode to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleApplyDateRange = (start: string, end: string) => {
    setCustomDateRange(start, end);
    // Note: Custom date range filtering would need to be implemented in StatsTable
    // by filtering game logs within the date range
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <TabBar />
      <Controls />

      <main className="container mx-auto px-6 py-8">
        <div className="card">
          <StatsTable />
        </div>
      </main>

      {/* Modals */}
      <AddTeamModal />
      <AddPlayerModal />
      <SearchNewPlayerModal />
      <DateRangeModal
        isOpen={isDateRangeModalOpen}
        onClose={closeDateRangeModal}
        onApply={handleApplyDateRange}
      />
      <GameLogModal
        player={gameLogPlayer}
        onClose={closeGameLog}
      />
    </div>
  );
}

export default App;
