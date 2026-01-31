// config/statCategories.ts
// Defines which stats appear in each category for batters and pitchers

export type StatCategory = 'standard' | 'advanced' | 'statcast' | 'arsenal';

export interface StatColumn {
  key: string;
  label: string;
  format?: 'int' | 'decimal1' | 'decimal2' | 'decimal3' | 'percent';
}

// Batting stat categories
export const BATTING_STATS: Record<StatCategory, StatColumn[]> = {
  standard: [
    { key: 'G', label: 'G', format: 'int' },
    { key: 'PA', label: 'PA', format: 'int' },
    { key: 'AB', label: 'AB', format: 'int' },
    { key: 'H', label: 'H', format: 'int' },
    { key: '2B', label: '2B', format: 'int' },
    { key: '3B', label: '3B', format: 'int' },
    { key: 'HR', label: 'HR', format: 'int' },
    { key: 'R', label: 'R', format: 'int' },
    { key: 'RBI', label: 'RBI', format: 'int' },
    { key: 'BB', label: 'BB', format: 'int' },
    { key: 'SO', label: 'SO', format: 'int' },
    { key: 'SB', label: 'SB', format: 'int' },
    { key: 'AVG', label: 'AVG', format: 'decimal3' },
    { key: 'OBP', label: 'OBP', format: 'decimal3' },
    { key: 'SLG', label: 'SLG', format: 'decimal3' },
    { key: 'OPS', label: 'OPS', format: 'decimal3' },
  ],
  advanced: [
    { key: 'PA', label: 'PA', format: 'int' },
    { key: 'ISO', label: 'ISO', format: 'decimal3' },
    { key: 'BB%', label: 'BB%', format: 'percent' },
    { key: 'K%', label: 'K%', format: 'percent' },
    { key: 'Swing%', label: 'Swing%', format: 'percent' },
    { key: 'Contact%', label: 'Contact%', format: 'percent' },
    { key: 'BABIP', label: 'BABIP', format: 'decimal3' },
    { key: 'wOBA', label: 'wOBA', format: 'decimal3' },
    { key: 'wRC+', label: 'wRC+', format: 'int' },
  ],
  statcast: [
    { key: 'BBE', label: 'BBE', format: 'int' },
    { key: 'EV', label: 'Avg EV', format: 'decimal1' },
    { key: 'EV50', label: '50th EV', format: 'decimal1' },
    { key: 'EV90', label: '90th EV', format: 'decimal1' },
    { key: 'maxEV', label: 'Max EV', format: 'decimal1' },
    { key: 'LA', label: 'LA', format: 'decimal1' },
    { key: 'Barrel%', label: 'Barrel%', format: 'percent' },
    { key: 'Hard%', label: 'Hard%', format: 'percent' },
    { key: 'Sweet Spot%', label: 'SwSp%', format: 'percent' },
    { key: 'GB%', label: 'GB%', format: 'percent' },
    { key: 'FB%', label: 'FB%', format: 'percent' },
    { key: 'LD%', label: 'LD%', format: 'percent' },
    { key: 'HR/FB', label: 'HR/FB', format: 'percent' },
    { key: 'Pull%', label: 'Pull%', format: 'percent' },
    { key: 'Pull-Air%', label: 'Pull-Air%', format: 'percent' },
    { key: 'Oppo%', label: 'Oppo%', format: 'percent' },
    { key: 'xBA', label: 'xBA', format: 'decimal3' },
    { key: 'xSLG', label: 'xSLG', format: 'decimal3' },
    { key: 'xwOBA', label: 'xwOBA', format: 'decimal3' },
  ],
  arsenal: [], // Batting has no arsenal tab
};

// Pitching stat categories
export const PITCHING_STATS: Record<StatCategory, StatColumn[]> = {
  standard: [
    { key: 'G', label: 'G', format: 'int' },
    { key: 'GS', label: 'GS', format: 'int' },
    { key: 'W', label: 'W', format: 'int' },
    { key: 'L', label: 'L', format: 'int' },
    { key: 'SV', label: 'SV', format: 'int' },
    { key: 'IP', label: 'IP', format: 'decimal1' },
    { key: 'H', label: 'H', format: 'int' },
    { key: 'R', label: 'R', format: 'int' },
    { key: 'ER', label: 'ER', format: 'int' },
    { key: 'HR', label: 'HR', format: 'int' },
    { key: 'BB', label: 'BB', format: 'int' },
    { key: 'SO', label: 'SO', format: 'int' },
    { key: 'ERA', label: 'ERA', format: 'decimal2' },
    { key: 'WHIP', label: 'WHIP', format: 'decimal2' },
  ],
  advanced: [
    { key: 'IP', label: 'IP', format: 'decimal1' },
    { key: 'K/9', label: 'K/9', format: 'decimal2' },
    { key: 'BB/9', label: 'BB/9', format: 'decimal2' },
    { key: 'K%', label: 'K%', format: 'percent' },
    { key: 'BB%', label: 'BB%', format: 'percent' },
    { key: 'K%-BB%', label: 'K%-BB%', format: 'percent' },
    { key: 'CSW%', label: 'CSW%', format: 'percent' },
    { key: 'FIP', label: 'FIP', format: 'decimal2' },
    { key: 'xFIP', label: 'xFIP', format: 'decimal2' },
    { key: 'BABIP', label: 'BABIP', format: 'decimal3' },
  ],
  statcast: [
    { key: 'IP', label: 'IP', format: 'decimal1' },
    { key: 'maxVelo', label: 'Max Velo', format: 'decimal1' },
    { key: 'Extension', label: 'Ext', format: 'decimal1' },
    { key: 'Whiff%', label: 'Whiff%', format: 'percent' },
    { key: 'GB%', label: 'GB%', format: 'percent' },
    { key: 'FB%', label: 'FB%', format: 'percent' },
    { key: 'LD%', label: 'LD%', format: 'percent' },
    { key: 'HR/FB', label: 'HR/FB', format: 'percent' },
  ],
  arsenal: [
    // Arsenal tab is rendered dynamically from pitch mix data, not as fixed columns
    // This array is a placeholder; the ArsenalTable component handles rendering
  ],
};

// Helper to format stat values
export function formatStatValue(
  value: number | undefined,
  format?: StatColumn['format']
): string {
  if (value === undefined || value === null) return '--';

  switch (format) {
    case 'int':
      return Math.round(value).toString();
    case 'decimal1':
      return value.toFixed(1);
    case 'decimal2':
      return value.toFixed(2);
    case 'decimal3':
      return value.toFixed(3);
    case 'percent':
      return (value * 100).toFixed(1) + '%';
    default:
      return value.toString();
  }
}
