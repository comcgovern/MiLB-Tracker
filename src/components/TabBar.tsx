// components/TabBar.tsx
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useUIStore } from '../stores/useUIStore';
import { useTeams } from '../hooks/useTeams';

export function TabBar() {
  const teams = useLiveQuery(() =>
    db.teams.orderBy('displayOrder').toArray()
  );

  const { activeTeamId, showDashboard, goToDashboard, goToTeam, openAddTeamModal, openConfirmModal } = useUIStore();
  const { deleteTeam, reorderTeams } = useTeams();

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDeleteTeam = (e: React.MouseEvent, teamId: string, teamName: string) => {
    e.stopPropagation(); // Prevent tab selection

    openConfirmModal({
      title: 'Delete Team',
      message: `Delete team "${teamName}" and all its players? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        await deleteTeam(teamId);
        // If we deleted the active team, go back to dashboard
        if (activeTeamId === teamId) {
          goToDashboard();
        }
      },
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, teamId: string) => {
    setDraggedId(teamId);
    e.dataTransfer.effectAllowed = 'move';
    // Add a slight delay to allow the drag image to be captured
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, teamId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (teamId !== draggedId) {
      setDragOverId(teamId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);

    if (!draggedId || draggedId === targetId || !teams) return;

    // Calculate new order
    const teamIds = teams.map(t => t.id!);
    const draggedIndex = teamIds.indexOf(draggedId);
    const targetIndex = teamIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item and insert at new position
    const newOrder = [...teamIds];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    await reorderTeams(newOrder);
    setDraggedId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6">
      <div className="flex items-center gap-2 overflow-x-auto">
        {/* Dashboard Tab */}
        <button
          onClick={goToDashboard}
          className={`
            px-4 py-3 font-medium whitespace-nowrap border-b-2 transition-colors
            ${
              showDashboard
                ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }
          `}
        >
          📊 Dashboard
        </button>

        {/* Separator */}
        {teams && teams.length > 0 && (
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />
        )}

        {/* Team Tabs */}
        {teams?.map((team) => (
          <div
            key={team.id}
            className={`
              relative group
              ${dragOverId === team.id ? 'border-l-2 border-primary-500' : ''}
              ${draggedId === team.id ? 'opacity-50' : ''}
            `}
            draggable
            onDragStart={(e) => handleDragStart(e, team.id!)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, team.id!)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, team.id!)}
          >
            <button
              onClick={() => goToTeam(team.id!)}
              className={`
                px-4 py-3 font-medium whitespace-nowrap border-b-2 transition-colors cursor-grab active:cursor-grabbing
                ${
                  !showDashboard && activeTeamId === team.id
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }
              `}
            >
              {team.name}
              {team.isWatchlist && ' ⭐'}
            </button>

            {/* Delete button - appears on hover */}
            <button
              onClick={(e) => handleDeleteTeam(e, team.id!, team.name)}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
              title={`Delete ${team.name}`}
              aria-label={`Delete ${team.name}`}
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={openAddTeamModal}
          className="px-4 py-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Add team"
        >
          + Add Team
        </button>
      </div>
    </div>
  );
}
