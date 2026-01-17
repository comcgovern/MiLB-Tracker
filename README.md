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

### Adding Players

1. Click "Add Player" to open the player selection dialog
2. Search for players by name
3. Select players to add to your active team

### Managing Teams

1. Click "+ Add Team" in the tab bar
2. Name your team and configure settings
3. Switch between teams using the tab bar
4. Use the Watchlist tab for prospects you're monitoring

### Viewing Stats

- Select a time period from the dropdown (Season, Last 7/14/30 days)
- Toggle stat categories to show/hide columns
- Click on a player for detailed stats and game logs

## Data Updates

The app uses GitHub Actions to automatically update player statistics:

- **During season** (April-September): Every 4 hours
- **Off-season** (October-March): Daily at 6 AM UTC

You can also manually trigger updates via the GitHub Actions tab.

## Adding Players to Track

Edit `data/players.json` to add players to track:

```json
{
  "players": [
    {
      "fangraphsId": "sa3014981",
      "name": "Player Name",
      "team": "Team Name",
      "org": "MLB",
      "level": "AAA",
      "position": "SS",
      "hasStatcast": true
    }
  ]
}
```

To find FanGraphs IDs:
```python
import pybaseball as pyb
results = pyb.playerid_lookup('last_name', 'first_name')
print(results)
```

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
│   ├── players.json       # Player registry
│   ├── stats/            # Season stats
│   ├── game-logs/        # Game-by-game logs
│   └── statcast/         # Statcast data
├── scripts/              # Python data fetchers
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
