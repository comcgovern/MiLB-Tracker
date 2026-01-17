import { useEffect } from 'react';
import { useSettingsStore } from './stores/useSettingsStore';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { Controls } from './components/Controls';
import { StatsTable } from './components/StatsTable';
import { AddTeamModal } from './components/AddTeamModal';
import { AddPlayerModal } from './components/AddPlayerModal';

function App() {
  const { darkMode } = useSettingsStore();

  // Apply dark mode to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
    </div>
  );
}

export default App;
