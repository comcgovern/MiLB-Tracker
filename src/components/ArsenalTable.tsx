// components/ArsenalTable.tsx
// Renders pitcher arsenal (pitch mix) data in a grouped format
import type { PitchArsenalEntry } from '../types';

// Human-readable pitch type names
const PITCH_TYPE_NAMES: Record<string, string> = {
  FF: '4-Seam Fastball',
  SI: 'Sinker',
  FC: 'Cutter',
  FT: '2-Seam Fastball',
  SL: 'Slider',
  CU: 'Curveball',
  KC: 'Knuckle Curve',
  CH: 'Changeup',
  FS: 'Splitter',
  SV: 'Sweeper',
  ST: 'Sweeping Curve',
  KN: 'Knuckleball',
  EP: 'Eephus',
  SC: 'Screwball',
  CS: 'Slow Curve',
};

// Sort order for pitch types (fastballs first, then breaking, then offspeed)
const PITCH_ORDER: string[] = ['FF', 'SI', 'FC', 'FT', 'SL', 'SV', 'ST', 'CU', 'KC', 'CS', 'CH', 'FS', 'KN', 'EP', 'SC'];

interface ArsenalTableProps {
  arsenal: Record<string, PitchArsenalEntry>;
  playerName: string;
}

function formatVal(val: number | undefined, decimals: number = 1): string {
  if (val === undefined || val === null) return '--';
  return val.toFixed(decimals);
}

function formatPct(val: number | undefined): string {
  if (val === undefined || val === null) return '--';
  return (val * 100).toFixed(1) + '%';
}

export function ArsenalTable({ arsenal, playerName }: ArsenalTableProps) {
  // Sort pitch types by usage order
  const sortedPitches = Object.entries(arsenal).sort(([a], [b]) => {
    const ai = PITCH_ORDER.indexOf(a);
    const bi = PITCH_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (sortedPitches.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500 italic text-sm">No arsenal data</span>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Pitch</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Usage</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Velo</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Max</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Spin</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">H Mov</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">V Mov</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ext</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Whiff%</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {sortedPitches.map(([type, data]) => (
            <tr key={type} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="px-3 py-1.5 whitespace-nowrap">
                <span className="font-medium text-gray-900 dark:text-white">{type}</span>
                <span className="ml-1.5 text-gray-400 dark:text-gray-500 text-xs">
                  {PITCH_TYPE_NAMES[type] || type}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{formatPct(data.pct)}</td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{formatVal(data.v)}</td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{formatVal(data.maxV)}</td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{data.s !== undefined ? Math.round(data.s) : '--'}</td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{formatVal(data.hMov)}″</td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{formatVal(data.vMov)}″</td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{formatVal(data.ext)}</td>
              <td className="px-3 py-1.5 text-right text-gray-900 dark:text-white">{formatPct(data.whiff)}</td>
              <td className="px-3 py-1.5 text-right text-gray-500 dark:text-gray-400">{data.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
