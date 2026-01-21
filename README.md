# MiLB Stats Tracker

A lightweight web application for tracking minor league baseball statistics across multiple fantasy baseball teams. Track your prospects with professional-grade stats from FanGraphs and Baseball Savant.

## Features

- Track multiple fantasy teams with customizable rosters
- Real-time MiLB statistics from FanGraphs
- Statcast data for AAA and select leagues
- Time-based splits (Season, Last 7/14/30 days)
- Dark mode support
- Offline-capable progressive web app
- Automated stats updates via GitHub Actions

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Zustand for state management
- Dexie.js for local storage (IndexedDB)
- TanStack Query for data fetching

### Backend
- Python 3.11+ with pybaseball
- GitHub Actions for automated data updates
- GitHub Pages for hosting

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/MiLB-Tracker.git
cd MiLB-Tracker
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install Python dependencies:
```bash
pip install -r scripts/requirements.txt
```

4. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Usage

### First Time Setup

When you first open the app:

1. Click **"+ Add Team"** in the tab bar to create your first team
2. Enter a team name (e.g., "My Dynasty Team")
3. Optionally add league name and platform details
4. Check "This is a watchlist" if creating a prospect watchlist

### Adding Players to Your Team

1. Make sure you have a team selected (click on a team tab)
2. Click **"+ Add Player"** in the controls bar
3. Search for players by name, organization, position, or level
4. Check the boxes next to players you want to add
5. Click **"Add X Players"** to add them to your active team

Players are stored locally in your browser's IndexedDB, so your team rosters persist across sessions.

### Managing Teams

- **Switch Teams**: Click on any team tab to view that team's roster
- **Add Teams**: Click "+ Add Team" in the tab bar
- **Watchlist**: Create a team and mark it as a watchlist for prospects you're monitoring
- **Delete Teams**: (Coming soon - use browser DevTools to delete via IndexedDB for now)

### Viewing Stats

- Select a time period from the dropdown (Season, Last 7/14/30 days)
- Toggle stat categories to show/hide columns
- Click on a player for detailed stats and game logs

## Data Updates

The app uses GitHub Actions to automatically update player statistics:

- **During season** (April-September): Every 4 hours
- **Off-season** (October-March): Daily at 6 AM UTC
- **Player index**: Rebuilt weekly to capture new call-ups and roster changes

### How It Works

1. **Player Index** (`player-index.json`): A searchable database of ~6,000+ active MiLB players, rebuilt weekly
2. **Stats Fetching**: Stats are automatically fetched for **all players in the player index**
3. **No Manual Setup**: Players you add through the UI will have stats available after the next scheduled update

You can also manually trigger updates via the GitHub Actions tab:
- **"Update MiLB Stats"** - Fetches latest stats for all players
- **"Build Player Index"** - Rebuilds the player search database

## Deployment

The app is deployed to GitHub Pages automatically when you push to the main branch.

### First-time Setup

1. Enable GitHub Pages in your repository settings
2. Set the source to "GitHub Actions"
3. Push to main branch to trigger the first deployment

## Project Structure

```
MiLB-Tracker/
├── .github/workflows/     # GitHub Actions workflows
├── data/                  # JSON data files
│   ├── player-index.json  # Searchable index of all MiLB players
│   ├── meta.json         # Last update timestamp and counts
│   ├── stats/            # Season stats (e.g., 2024.json, 2025.json)
│   ├── game-logs/        # Game-by-game logs
│   └── statcast/         # Statcast data
├── scripts/              # Python data fetchers
│   ├── build_player_index.py  # Builds searchable player database
│   ├── fetch_stats.py         # Fetches stats for all indexed players
│   └── fetch_statcast.py      # Fetches Statcast metrics
├── src/                  # React application
│   ├── components/       # React components
│   ├── db/              # Dexie database config
│   ├── stores/          # Zustand stores
│   └── types/           # TypeScript types
└── docs/                # Documentation
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Data provided by [FanGraphs](https://www.fangraphs.com/)
- Statcast data from [Baseball Savant](https://baseballsavant.mlb.com/)
- Built with [pybaseball](https://github.com/jldbc/pybaseball)
