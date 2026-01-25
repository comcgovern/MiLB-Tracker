// utils/csvExport.ts
// CSV export utility for player stats

import type { Player, BattingStats, PitchingStats, MiLBLevel } from '../types';
import { BATTING_STATS, PITCHING_STATS, formatStatValue } from '../config/statCategories';

interface PlayerRowData {
  player: Player | undefined;
  stats: BattingStats | PitchingStats | undefined;
  level?: MiLBLevel;
  isTotal?: boolean;
}

interface ExportOptions {
  batters: PlayerRowData[];
  pitchers: PlayerRowData[];
  teamName?: string;
  splitLabel?: string;
}

// Convert player data to CSV string
export function exportToCSV(options: ExportOptions): string {
  const { batters, pitchers, teamName, splitLabel } = options;
  const lines: string[] = [];

  // Header comment with metadata
  if (teamName) {
    lines.push(`# Team: ${teamName}`);
  }
  if (splitLabel) {
    lines.push(`# Time Period: ${splitLabel}`);
  }
  lines.push(`# Exported: ${new Date().toLocaleString()}`);
  lines.push('');

  // Export batters
  if (batters.length > 0) {
    lines.push('# BATTERS');
    const batterColumns = ['Name', 'Position', 'Level', 'Org', 'Team', ...BATTING_STATS.standard.map(c => c.label)];
    lines.push(batterColumns.join(','));

    for (const row of batters) {
      if (!row.player) continue;
      const { player, stats, level, isTotal } = row;
      const displayLevel = isTotal ? 'MiLB' : (level || player.level || '');

      const values = [
        escapeCSV(player.name),
        escapeCSV(player.position),
        escapeCSV(displayLevel),
        escapeCSV(player.org),
        escapeCSV(player.team),
        ...BATTING_STATS.standard.map(col => {
          const value = (stats as BattingStats)?.[col.key as keyof BattingStats];
          return formatStatValue(value as number | undefined, col.format);
        }),
      ];
      lines.push(values.join(','));
    }
    lines.push('');
  }

  // Export pitchers
  if (pitchers.length > 0) {
    lines.push('# PITCHERS');
    const pitcherColumns = ['Name', 'Position', 'Level', 'Org', 'Team', ...PITCHING_STATS.standard.map(c => c.label)];
    lines.push(pitcherColumns.join(','));

    for (const row of pitchers) {
      if (!row.player) continue;
      const { player, stats, level, isTotal } = row;
      const displayLevel = isTotal ? 'MiLB' : (level || player.level || '');

      const values = [
        escapeCSV(player.name),
        escapeCSV(player.position),
        escapeCSV(displayLevel),
        escapeCSV(player.org),
        escapeCSV(player.team),
        ...PITCHING_STATS.standard.map(col => {
          const value = (stats as PitchingStats)?.[col.key as keyof PitchingStats];
          return formatStatValue(value as number | undefined, col.format);
        }),
      ];
      lines.push(values.join(','));
    }
  }

  return lines.join('\n');
}

// Escape CSV value (handle commas, quotes, newlines)
function escapeCSV(value: string | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Trigger CSV file download
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// Generate filename for export
export function generateExportFilename(teamName?: string, splitLabel?: string): string {
  const parts = ['milb-stats'];
  if (teamName) {
    parts.push(teamName.toLowerCase().replace(/\s+/g, '-'));
  }
  if (splitLabel) {
    parts.push(splitLabel.toLowerCase().replace(/\s+/g, '-'));
  }
  const date = new Date().toISOString().split('T')[0];
  parts.push(date);
  return `${parts.join('_')}.csv`;
}
