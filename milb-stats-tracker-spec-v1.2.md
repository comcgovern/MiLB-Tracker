# MiLB Fantasy Baseball Stats Tracker

## Specification Document
**Version:** 1.2  
**Last Updated:** January 2026

---

## 1. Overview

### 1.1 Purpose
A lightweight web application for tracking minor league baseball statistics across multiple fantasy baseball teams. The app aggregates data from FanGraphs and Baseball Savant APIs to provide comprehensive statistical analysis including standard, advanced, and Statcast metrics.

### 1.2 Target Users
Fantasy baseball players who roster minor league prospects and need consolidated statistical tracking across multiple leagues/teams.

### 1.3 Key Value Propositions
- Single dashboard for all MiLB fantasy assets
- Unified view across multiple fantasy teams
- Professional-grade statistics (Standard, Advanced, Statcast)
- Flexible time-based splits
- Watchlist for prospect monitoring

---

## 2. Features

### 2.1 Team Management

#### 2.1.1 Team Tabs
- Each fantasy team represented as a separate tab
- User can create, rename, reorder, and delete teams
- Team metadata: name, league name, platform (optional)

#### 2.1.2 Player Roster Management
- **CSV Upload**: Bulk import players via CSV (columns: player name, team, position, FanGraphs ID)
- **Manual Add**: Search/autocomplete player lookup
- **Remove**: Individual or bulk player removal
- **Edit**: Update player positions, notes

#### 2.1.3 Watchlist Tab
- Dedicated tab for prospects not currently rostered
- Same functionality as team tabs
- Optional: priority/tier tagging

### 2.2 Player Information Display

#### 2.2.1 Player Card/Row Data
| Field | Source | Notes |
|-------|--------|-------|
| Name | FanGraphs | Linked to FanGraphs profile |
| Age | FanGraphs | Current age |
| Team | FanGraphs | Current MiLB affiliate |
| Level | FanGraphs | A, A+, AA, AAA |
| Organization | FanGraphs | MLB parent club |
| Position(s) | FanGraphs | Primary and secondary |
| Bats/Throws | FanGraphs | L/R/S |
| Status | FanGraphs | Active, IL, etc. |
| User Notes | Local | Free-text field |

#### 2.2.2 Statcast Availability Indicator
- Visual badge indicating if player's league has Statcast tracking
- Currently available: AAA (all), AA (all), some A+ leagues
- Tooltip explaining data availability

### 2.3 Statistical Categories

Stats are organized into categories mirroring FanGraphs' structure. See **Section 6.2** for the complete list of available stats.

#### 2.3.1 Batting Categories
| Category | Description | Source |
|----------|-------------|--------|
| Dashboard | Key metrics overview | FanGraphs |
| Standard | Traditional counting stats | FanGraphs |
| Advanced | Rate stats, wOBA, wRC+ | FanGraphs |
| Batted Ball | Contact quality, spray charts | FanGraphs |
| Statcast | Exit velo, xStats, sprint speed | Savant (AAA/FSL only) |

#### 2.3.2 Pitching Categories
| Category | Description | Source |
|----------|-------------|--------|
| Dashboard | Key metrics overview | FanGraphs |
| Standard | Traditional counting stats | FanGraphs |
| Advanced | FIP, xFIP, K%, BB% | FanGraphs |
| Batted Ball | Contact quality allowed | FanGraphs |
| Statcast | Pitch velo, spin, movement | Savant (AAA/FSL only) |

#### 2.3.3 Statcast Availability
Statcast data is only available for players in leagues with tracking:
- ✅ **Triple-A**: All parks (since 2023)
- ✅ **Single-A Florida State League**: All parks (since 2021)
- 🔄 **Double-A**: Expanding coverage
- ❌ **Other levels**: Not yet available

The UI will show a visual indicator when Statcast data is unavailable for a player.

### 2.4 Time-Based Splits

#### 2.4.1 Preset Splits
| Split | Description |
|-------|-------------|
| Today | Current day's games |
| Yesterday | Previous day's games |
| Last 7 Days | Rolling 7-day window |
| Last 14 Days | Rolling 14-day window |
| Last 30 Days | Rolling 30-day window |
| Season | Full current season |

#### 2.4.2 Custom Date Range
- Date picker for start and end dates
- Saved custom ranges (user-defined)

### 2.5 Additional Splits (Phase 2)

| Split Type | Options |
|------------|---------|
| vs Hand | vs LHP, vs RHP |
| Location | Home, Away |
| Level | By MiLB level (for players who moved) |
| Month | By calendar month |

### 2.6 Alerts & Notifications (Phase 2)

#### 2.6.1 Alert Types
- **Performance Threshold**: Trigger when stat exceeds/falls below threshold over specified period
- **Promotion/Demotion**: Level change detection
- **Hot Streak**: Configurable hot streak detection (e.g., 5+ game hitting streak)
- **Cold Streak**: Configurable cold streak detection

#### 2.6.2 Delivery Methods
- In-app notification center
- Email digest (daily/weekly)
- Browser push notifications (optional)

### 2.7 Visualization (Phase 2)

#### 2.7.1 Charts
- Rolling average line charts (select stat, select window)
- Stat comparison bar charts
- Trend sparklines in stat tables

#### 2.7.2 Trend Indicators
- Up/down arrows based on recent performance vs season
- Color coding (green/red) for positive/negative trends

### 2.8 Utility Features

#### 2.8.1 Player Comparison
- Side-by-side comparison of 2-4 players
- Select which stat categories to compare
- Visual diff highlighting

#### 2.8.2 Data Export
- Export team/watchlist to CSV
- Export with selected stats and splits
- Print-friendly view

#### 2.8.3 Search & Filter
- Global player search across all teams
- Filter by position, level, organization
- Sort by any stat column

#### 2.8.4 Settings
- Dark/light mode toggle
- Default split preference
- Stat category visibility toggles
- Auto-refresh interval (during games)

---

## 3. Data Model

The data model is designed for IndexedDB storage in the browser. See Section 4.8 for the full TypeScript schema.

### 3.1 Core Entities Summary

| Entity | Purpose | Key Fields |
|--------|---------|------------|
| Team | Fantasy team or watchlist | id, name, isWatchlist, displayOrder |
| TeamPlayer | Junction: player on a team | teamId, playerId, userNotes |
| Player | Player metadata cache | fangraphsId, savantId, name, level, org |
| PlayerStats | Daily stat snapshots | playerId, date, stats (JSON), source |
| Settings | User preferences | key, value |

### 3.2 Stats Storage Format

Stats are stored as flexible JSON to accommodate different stat categories:

```json
{
  "batting": {
    "dashboard": { "PA": 125, "AVG": ".298", "wRC+": 135 },
    "standard": { "G": 30, "AB": 110, "H": 33 },
    "advanced": { "BB%": 12.5, "K%": 18.2, "ISO": ".220" },
    "battedBall": { "GB%": 42.1, "FB%": 35.2, "Hard%": 45.0 },
    "statcast": { "EV": 92.5, "LA": 12.3, "xwOBA": ".380" }
  },
  "pitching": {
    "dashboard": { "IP": 45.2, "ERA": 2.76, "FIP": 3.01 },
    "standard": { "W": 4, "L": 2, "SV": 0 },
    "advanced": { "K%": 28.5, "BB%": 7.2, "WHIP": 1.05 },
    "battedBall": { "GB%": 48.2, "HR/FB": 8.5 },
    "statcast": { "Velo": 95.2, "SpinRate": 2350 }
  }
}
```

---

## 4. Technical Architecture

### 4.1 Design Principles

**Hybrid Architecture**: Python handles data scraping (via pybaseball), React handles the UI. Data flows from Python → JSON files → React app. This enables:
- Free hosting on GitHub Pages
- Reliable data scraping via pybaseball
- Automated updates via GitHub Actions
- No CORS issues
- No backend server costs

### 4.2 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Data Layer** | | |
| Data Fetching | Python 3.11+ + pybaseball | Handles FanGraphs/Savant scraping reliably |
| Data Storage | JSON files in `/data` | Simple, portable, works with GitHub Pages |
| Automation | GitHub Actions | Scheduled data refresh, free CI/CD |
| **Frontend** | | |
| Framework | React 18+ with TypeScript | Component-based, type-safe |
| Build Tool | Vite | Fast builds, easy GitHub Pages deployment |
| Styling | Tailwind CSS | Rapid UI development |
| State Management | Zustand | Lightweight, persistent storage support |
| Data Fetching | TanStack Query | Caching, background refetch |
| Local Storage | IndexedDB (via Dexie.js) | User data (teams, notes) |
| Charts | Recharts | Lightweight, React-friendly |
| Hosting | GitHub Pages | Free, static file hosting |

### 4.3 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GitHub Repository                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    GitHub Actions Workflows                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │ update-stats.yml│  │ deploy-app.yml  │  │ on-demand.yml   │   │  │
│  │  │ (scheduled)     │  │ (on push)       │  │ (manual)        │   │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │  │
│  └───────────│────────────────────│────────────────────│────────────┘  │
│              │                    │                    │                │
│              ▼                    │                    │                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Python Data Pipeline                           │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                      pybaseball                              │  │  │
│  │  │  • milb_batter_game_logs_fg(playerid, year)                 │  │  │
│  │  │  • milb_pitcher_game_logs_fg(playerid, year)                │  │  │
│  │  │  • playerid_lookup(last, first)                             │  │  │
│  │  │  • statcast_batter_exitvelo_barrels() - AAA Statcast        │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                     │  │
│  │                              ▼                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                   JSON Data Files                            │  │  │
│  │  │  • /data/players.json      (player registry & metadata)     │  │  │
│  │  │  • /data/stats/2025.json   (season stats by player)         │  │  │
│  │  │  • /data/game-logs/        (daily game logs)                │  │  │
│  │  │  • /data/statcast/         (Statcast data where available)  │  │  │
│  │  │  • /data/meta.json         (last update timestamp)          │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│              │                    │                                     │
└──────────────│────────────────────│─────────────────────────────────────┘
               │                    │
               │                    ▼
               │    ┌───────────────────────────────────────┐
               │    │         GitHub Pages Hosting          │
               │    │   https://username.github.io/milb/    │
               │    └───────────────────────────────────────┘
               │                    │
               ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         React Application                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │  │
│  │  │ Team Tabs   │  │ Stats Table │  │ Player      │  │ Settings │ │  │
│  │  │             │  │             │  │ Search      │  │          │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  TanStack Query: Fetches /data/*.json, caches in memory           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  IndexedDB (Dexie): Teams, Player Assignments, User Notes         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Repository Structure

```
milb-stats-tracker/
├── .github/
│   └── workflows/
│       ├── update-stats.yml      # Scheduled stats refresh
│       ├── deploy.yml            # Build & deploy to GitHub Pages
│       └── on-demand-update.yml  # Manual stats refresh
├── scripts/
│   ├── fetch_stats.py            # Main data fetcher
│   ├── fetch_statcast.py         # Statcast-specific fetcher
│   ├── aggregate_splits.py       # Calculate time-based splits
│   ├── utils.py                  # Shared utilities
│   └── requirements.txt          # Python dependencies
├── data/
│   ├── players.json              # Player registry (tracked players)
│   ├── meta.json                 # Last update timestamps
│   ├── stats/
│   │   └── 2025.json             # Season stats
│   ├── game-logs/
│   │   └── {playerId}.json       # Per-player game logs
│   └── statcast/
│       └── 2025.json             # Statcast data (AAA/FSL)
├── src/                          # React application
│   ├── components/
│   ├── hooks/
│   ├── stores/
│   ├── types/
│   └── ...
├── public/
├── package.json
├── vite.config.ts
└── README.md
```

---

## 5. GitHub Actions Implementation

### 5.1 Overview

GitHub Actions automates the entire data pipeline:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `update-stats.yml` | Scheduled (cron) | Regular stats refresh during season |
| `deploy.yml` | Push to main | Build React app, deploy to GitHub Pages |
| `on-demand-update.yml` | Manual (workflow_dispatch) | Force refresh specific players |

### 5.2 Scheduled Stats Update Workflow

```yaml
# .github/workflows/update-stats.yml
name: Update MiLB Stats

on:
  schedule:
    # During MLB season (April-September): Every 4 hours
    - cron: '0 2,6,10,14,18,22 * 4-9 *'
    # Off-season (October-March): Daily at 6 AM UTC
    - cron: '0 6 * 10-12,1-3 *'
  workflow_dispatch:
    inputs:
      force_full_refresh:
        description: 'Force refresh all players (ignore cache)'
        required: false
        default: 'false'
        type: boolean
      specific_players:
        description: 'Comma-separated player IDs (leave empty for all)'
        required: false
        default: ''
        type: string

env:
  PYTHON_VERSION: '3.11'

jobs:
  update-stats:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'
          cache-dependency-path: scripts/requirements.txt
      
      - name: Install dependencies
        run: |
          pip install -r scripts/requirements.txt
      
      - name: Fetch player stats
        run: |
          python scripts/fetch_stats.py \
            --year 2025 \
            ${{ github.event.inputs.force_full_refresh == 'true' && '--no-cache' || '' }} \
            ${{ github.event.inputs.specific_players && format('--players {0}', github.event.inputs.specific_players) || '' }}
        env:
          PYTHONUNBUFFERED: '1'
      
      - name: Fetch Statcast data
        run: |
          python scripts/fetch_statcast.py --year 2025
        continue-on-error: true  # Statcast sometimes unavailable
      
      - name: Calculate splits
        run: |
          python scripts/aggregate_splits.py
      
      - name: Update metadata
        run: |
          echo '{"lastUpdated": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'", "playerCount": '$(jq '.players | length' data/players.json)'}' > data/meta.json
      
      - name: Commit and push changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          
          git add data/
          
          # Only commit if there are changes
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "📊 Update stats $(date -u +%Y-%m-%d\ %H:%M\ UTC)"
            git push
          fi

  # Trigger deploy after stats update
  trigger-deploy:
    needs: update-stats
    runs-on: ubuntu-latest
    steps:
      - name: Trigger deployment
        uses: peter-evans/repository-dispatch@v2
        with:
          event-type: stats-updated
```

### 5.3 Deploy Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - 'public/**'
      - 'data/**'
      - 'package.json'
      - 'vite.config.ts'
  repository_dispatch:
    types: [stats-updated]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          VITE_DATA_BASE_URL: '/${{ github.event.repository.name }}/data'
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 5.4 On-Demand Update Workflow

```yaml
# .github/workflows/on-demand-update.yml
name: On-Demand Stats Update

on:
  workflow_dispatch:
    inputs:
      player_ids:
        description: 'Comma-separated FanGraphs player IDs'
        required: true
        type: string
      include_statcast:
        description: 'Include Statcast data'
        required: false
        default: 'true'
        type: boolean

jobs:
  update-specific-players:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: scripts/requirements.txt
      
      - run: pip install -r scripts/requirements.txt
      
      - name: Fetch specific players
        run: |
          python scripts/fetch_stats.py \
            --players "${{ github.event.inputs.player_ids }}" \
            --no-cache
      
      - name: Fetch Statcast (if enabled)
        if: ${{ github.event.inputs.include_statcast == 'true' }}
        run: python scripts/fetch_statcast.py --players "${{ github.event.inputs.player_ids }}"
        continue-on-error: true
      
      - name: Commit changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/
          git diff --staged --quiet || git commit -m "📊 Update stats for: ${{ github.event.inputs.player_ids }}"
          git push
```

### 5.5 Python Scripts

#### 5.5.1 Requirements

```
# scripts/requirements.txt
pybaseball>=2.2.7
pandas>=2.0.0
numpy>=1.24.0
requests>=2.31.0
```

#### 5.5.2 Main Stats Fetcher

```python
#!/usr/bin/env python3
"""
scripts/fetch_stats.py
Fetch MiLB stats using pybaseball and save to JSON files.
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import pybaseball as pyb

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Paths
DATA_DIR = Path(__file__).parent.parent / 'data'
STATS_DIR = DATA_DIR / 'stats'
GAME_LOGS_DIR = DATA_DIR / 'game-logs'
PLAYERS_FILE = DATA_DIR / 'players.json'

# Rate limiting
REQUEST_DELAY = 2.0  # seconds between requests


def load_players() -> dict:
    """Load the player registry."""
    if PLAYERS_FILE.exists():
        with open(PLAYERS_FILE) as f:
            return json.load(f)
    return {'players': []}


def save_players(data: dict) -> None:
    """Save the player registry."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PLAYERS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def fetch_batter_stats(player_id: str, year: int) -> Optional[dict]:
    """Fetch batting game logs for a player."""
    try:
        df = pyb.milb_batter_game_logs_fg(player_id, year)
        if df is None or df.empty:
            return None
        
        # Convert to records
        games = df.to_dict(orient='records')
        
        # Calculate season totals
        season = calculate_batting_season_totals(df)
        
        return {
            'type': 'batter',
            'games': games,
            'season': season,
            'splits': calculate_batting_splits(df)
        }
    except Exception as e:
        logger.warning(f"Failed to fetch batting stats for {player_id}: {e}")
        return None


def fetch_pitcher_stats(player_id: str, year: int) -> Optional[dict]:
    """Fetch pitching game logs for a player."""
    try:
        df = pyb.milb_pitcher_game_logs_fg(player_id, year)
        if df is None or df.empty:
            return None
        
        games = df.to_dict(orient='records')
        season = calculate_pitching_season_totals(df)
        
        return {
            'type': 'pitcher',
            'games': games,
            'season': season,
            'splits': calculate_pitching_splits(df)
        }
    except Exception as e:
        logger.warning(f"Failed to fetch pitching stats for {player_id}: {e}")
        return None


def calculate_batting_season_totals(df: pd.DataFrame) -> dict:
    """Calculate season batting totals from game logs."""
    totals = {}
    
    # Counting stats - sum
    count_cols = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 
                  'BB', 'SO', 'HBP', 'SB', 'CS', 'SF', 'SH', 'GDP']
    for col in count_cols:
        if col in df.columns:
            totals[col] = int(df[col].sum())
    
    # Calculate rate stats
    if totals.get('AB', 0) > 0:
        h = totals.get('H', 0)
        ab = totals['AB']
        bb = totals.get('BB', 0)
        hbp = totals.get('HBP', 0)
        sf = totals.get('SF', 0)
        pa = totals.get('PA', ab + bb + hbp + sf)
        
        totals['AVG'] = round(h / ab, 3) if ab > 0 else 0
        totals['OBP'] = round((h + bb + hbp) / pa, 3) if pa > 0 else 0
        
        tb = h + totals.get('2B', 0) + 2 * totals.get('3B', 0) + 3 * totals.get('HR', 0)
        totals['SLG'] = round(tb / ab, 3) if ab > 0 else 0
        totals['OPS'] = round(totals['OBP'] + totals['SLG'], 3)
        
        totals['ISO'] = round(totals['SLG'] - totals['AVG'], 3)
        totals['BB%'] = round(100 * bb / pa, 1) if pa > 0 else 0
        totals['K%'] = round(100 * totals.get('SO', 0) / pa, 1) if pa > 0 else 0
    
    return totals


def calculate_batting_splits(df: pd.DataFrame) -> dict:
    """Calculate time-based splits for batters."""
    splits = {}
    today = datetime.now().date()
    
    # Convert date column
    if 'Date' in df.columns:
        df['_date'] = pd.to_datetime(df['Date']).dt.date
    else:
        return splits
    
    split_ranges = {
        'last7': 7,
        'last14': 14,
        'last30': 30,
    }
    
    for name, days in split_ranges.items():
        cutoff = today - timedelta(days=days)
        filtered = df[df['_date'] >= cutoff]
        if not filtered.empty:
            splits[name] = calculate_batting_season_totals(filtered)
    
    return splits


def calculate_pitching_season_totals(df: pd.DataFrame) -> dict:
    """Calculate season pitching totals from game logs."""
    totals = {}
    
    # Counting stats
    count_cols = ['G', 'GS', 'W', 'L', 'SV', 'HLD', 'BS', 'IP', 
                  'H', 'R', 'ER', 'HR', 'BB', 'SO', 'HBP']
    for col in count_cols:
        if col in df.columns:
            val = df[col].sum()
            totals[col] = float(val) if col == 'IP' else int(val)
    
    # Calculate rate stats
    ip = totals.get('IP', 0)
    if ip > 0:
        totals['ERA'] = round(9 * totals.get('ER', 0) / ip, 2)
        totals['WHIP'] = round((totals.get('BB', 0) + totals.get('H', 0)) / ip, 2)
        totals['K/9'] = round(9 * totals.get('SO', 0) / ip, 1)
        totals['BB/9'] = round(9 * totals.get('BB', 0) / ip, 1)
        totals['HR/9'] = round(9 * totals.get('HR', 0) / ip, 1)
    
    # K% and BB% (need batters faced)
    bf = totals.get('H', 0) + totals.get('BB', 0) + totals.get('SO', 0) + totals.get('HBP', 0)
    if bf > 0:
        totals['K%'] = round(100 * totals.get('SO', 0) / bf, 1)
        totals['BB%'] = round(100 * totals.get('BB', 0) / bf, 1)
    
    return totals


def calculate_pitching_splits(df: pd.DataFrame) -> dict:
    """Calculate time-based splits for pitchers."""
    splits = {}
    today = datetime.now().date()
    
    if 'Date' in df.columns:
        df['_date'] = pd.to_datetime(df['Date']).dt.date
    else:
        return splits
    
    split_ranges = {
        'last7': 7,
        'last14': 14,
        'last30': 30,
    }
    
    for name, days in split_ranges.items():
        cutoff = today - timedelta(days=days)
        filtered = df[df['_date'] >= cutoff]
        if not filtered.empty:
            splits[name] = calculate_pitching_season_totals(filtered)
    
    return splits


def fetch_player(player_id: str, year: int) -> Optional[dict]:
    """Fetch stats for a single player (tries batter first, then pitcher)."""
    logger.info(f"Fetching stats for {player_id}...")
    
    # Try batter first
    stats = fetch_batter_stats(player_id, year)
    if stats:
        return stats
    
    # Try pitcher
    time.sleep(REQUEST_DELAY)
    stats = fetch_pitcher_stats(player_id, year)
    if stats:
        return stats
    
    logger.warning(f"No stats found for {player_id}")
    return None


def fetch_all_players(player_ids: list[str], year: int, use_cache: bool = True) -> dict:
    """Fetch stats for all specified players."""
    all_stats = {}
    
    # Load existing data if using cache
    stats_file = STATS_DIR / f'{year}.json'
    if use_cache and stats_file.exists():
        with open(stats_file) as f:
            all_stats = json.load(f)
        logger.info(f"Loaded {len(all_stats)} players from cache")
    
    for i, player_id in enumerate(player_ids):
        if use_cache and player_id in all_stats:
            logger.info(f"Skipping {player_id} (cached)")
            continue
        
        stats = fetch_player(player_id, year)
        if stats:
            all_stats[player_id] = stats
            
            # Save game logs separately
            save_game_logs(player_id, stats.get('games', []))
        
        # Rate limiting
        if i < len(player_ids) - 1:
            time.sleep(REQUEST_DELAY)
    
    # Save aggregated stats
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    with open(stats_file, 'w') as f:
        json.dump(all_stats, f, indent=2, default=str)
    
    logger.info(f"Saved stats for {len(all_stats)} players")
    return all_stats


def save_game_logs(player_id: str, games: list) -> None:
    """Save individual player game logs."""
    GAME_LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(GAME_LOGS_DIR / f'{player_id}.json', 'w') as f:
        json.dump(games, f, indent=2, default=str)


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB stats')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year (default: current year)')
    parser.add_argument('--players', type=str, default='',
                        help='Comma-separated player IDs (default: all in players.json)')
    parser.add_argument('--no-cache', action='store_true',
                        help='Ignore cached data and refresh all')
    args = parser.parse_args()
    
    # Enable pybaseball caching
    pyb.cache.enable()
    
    # Get player list
    if args.players:
        player_ids = [p.strip() for p in args.players.split(',')]
    else:
        registry = load_players()
        player_ids = [p['fangraphsId'] for p in registry.get('players', [])]
    
    if not player_ids:
        logger.error("No players to fetch. Add players to data/players.json or use --players")
        sys.exit(1)
    
    logger.info(f"Fetching stats for {len(player_ids)} players (year={args.year})")
    
    # Fetch stats
    fetch_all_players(player_ids, args.year, use_cache=not args.no_cache)
    
    logger.info("Done!")


if __name__ == '__main__':
    main()
```

#### 5.5.3 Statcast Fetcher

```python
#!/usr/bin/env python3
"""
scripts/fetch_statcast.py
Fetch MiLB Statcast data for AAA and other tracked levels.
"""

import argparse
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import pybaseball as pyb

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / 'data'
STATCAST_DIR = DATA_DIR / 'statcast'


def fetch_statcast_batters(year: int, player_ids: list[str] = None) -> dict:
    """
    Fetch Statcast batting data for AAA players.
    
    Note: pybaseball's statcast functions work for MLB. For MiLB,
    we may need to scrape Baseball Savant's MiLB Statcast search directly.
    This is a placeholder that shows the structure.
    """
    try:
        # For now, fetch leaderboard data
        # In production, you'd scrape baseballsavant.mlb.com/statcast-search-minors
        logger.info("Fetching Statcast batter data...")
        
        # Example: fetch exit velocity leaderboard
        # df = pyb.statcast_batter_exitvelo_barrels(year)
        
        # Placeholder structure
        data = {
            'lastUpdated': datetime.now().isoformat(),
            'players': {}
        }
        
        return data
    except Exception as e:
        logger.error(f"Failed to fetch Statcast data: {e}")
        return {}


def fetch_statcast_pitchers(year: int, player_ids: list[str] = None) -> dict:
    """Fetch Statcast pitching data for AAA players."""
    try:
        logger.info("Fetching Statcast pitcher data...")
        
        data = {
            'lastUpdated': datetime.now().isoformat(),
            'players': {}
        }
        
        return data
    except Exception as e:
        logger.error(f"Failed to fetch Statcast pitcher data: {e}")
        return {}


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB Statcast data')
    parser.add_argument('--year', type=int, default=datetime.now().year)
    parser.add_argument('--players', type=str, default='',
                        help='Comma-separated player IDs')
    args = parser.parse_args()
    
    player_ids = [p.strip() for p in args.players.split(',')] if args.players else None
    
    # Fetch data
    batters = fetch_statcast_batters(args.year, player_ids)
    pitchers = fetch_statcast_pitchers(args.year, player_ids)
    
    # Merge and save
    STATCAST_DIR.mkdir(parents=True, exist_ok=True)
    
    combined = {
        'lastUpdated': datetime.now().isoformat(),
        'batters': batters.get('players', {}),
        'pitchers': pitchers.get('players', {})
    }
    
    with open(STATCAST_DIR / f'{args.year}.json', 'w') as f:
        json.dump(combined, f, indent=2)
    
    logger.info("Statcast data saved")


if __name__ == '__main__':
    main()
```

### 5.6 Player Registry Format

The `data/players.json` file defines which players to track:

```json
{
  "players": [
    {
      "fangraphsId": "sa3014981",
      "name": "Jackson Holliday",
      "team": "Norfolk Tides",
      "org": "BAL",
      "level": "AAA",
      "position": "SS",
      "mlbamId": "725586",
      "hasStatcast": true
    },
    {
      "fangraphsId": "sa3012912",
      "name": "James Wood",
      "team": "Rochester Red Wings",
      "org": "WSH",
      "level": "AAA",
      "position": "OF",
      "mlbamId": "699629",
      "hasStatcast": true
    },
    {
      "fangraphsId": "sa3010417",
      "name": "Marcelo Mayer",
      "team": "Portland Sea Dogs",
      "org": "BOS",
      "level": "AA",
      "position": "SS",
      "mlbamId": "691958",
      "hasStatcast": false
    }
  ],
  "lastUpdated": "2025-01-17T12:00:00Z"
}
```

### 5.7 Adding New Players

To add players to track:

1. **Edit `data/players.json`** directly and commit
2. **Or use the web app** (which updates local IndexedDB, then you can export)
3. **Or trigger the on-demand workflow** with new player IDs

Finding FanGraphs IDs:
```python
import pybaseball as pyb
# Search for a player
results = pyb.playerid_lookup('holliday', 'jackson')
print(results)
```

### 5.8 Workflow Schedule Optimization

| Period | Frequency | Rationale |
|--------|-----------|-----------|
| April-September (in-season) | Every 4 hours | Games typically 7pm ET, want fresh data |
| March (spring training) | Every 12 hours | Some games, less urgency |
| October-February (off-season) | Daily | Winter leagues, no MiLB |

Customize the cron schedule in `update-stats.yml`:

```yaml
schedule:
  # Weekdays during season: 6am, 2pm, 10pm UTC (covers game times)
  - cron: '0 6,14,22 * 4-9 1-5'
  # Weekends during season: Every 4 hours
  - cron: '0 */4 * 4-9 0,6'
```

### 5.9 Error Handling & Monitoring

The workflows include:
- `continue-on-error: true` for non-critical steps (Statcast)
- Logging via GitHub Actions output
- Empty commit prevention (no push if no changes)

For monitoring, check:
- **Actions tab** in your GitHub repo for run history
- **data/meta.json** for last successful update timestamp
- React app can show "Last updated: X hours ago" based on meta.json

---

## 6. External API Integration

### 6.1 FanGraphs Data (via pybaseball)

pybaseball wraps FanGraphs' unofficial APIs and scraping:

| pybaseball Function | Data Returned |
|---------------------|---------------|
| `milb_batter_game_logs_fg(id, year)` | Game-by-game batting logs |
| `milb_pitcher_game_logs_fg(id, year)` | Game-by-game pitching logs |
| `playerid_lookup(last, first)` | Player ID mappings |
| `batting_stats(year, qual)` | Leaderboard data |

### 6.2 FanGraphs Stat Categories (MiLB)

#### Batting - Dashboard
| Stat | Description |
|------|-------------|
| G | Games |
| PA | Plate Appearances |
| HR | Home Runs |
| R | Runs |
| RBI | Runs Batted In |
| SB | Stolen Bases |
| BB% | Walk Rate |
| K% | Strikeout Rate |
| ISO | Isolated Power |
| BABIP | Batting Average on Balls in Play |
| AVG | Batting Average |
| OBP | On-Base Percentage |
| SLG | Slugging Percentage |
| wOBA | Weighted On-Base Average |
| wRC+ | Weighted Runs Created Plus |

#### Batting - Standard
| Stat | Description |
|------|-------------|
| G | Games |
| AB | At Bats |
| PA | Plate Appearances |
| H | Hits |
| 1B | Singles |
| 2B | Doubles |
| 3B | Triples |
| HR | Home Runs |
| R | Runs |
| RBI | Runs Batted In |
| BB | Walks |
| IBB | Intentional Walks |
| SO | Strikeouts |
| HBP | Hit By Pitch |
| SF | Sacrifice Flies |
| SH | Sacrifice Hits |
| GDP | Grounded Into Double Play |
| SB | Stolen Bases |
| CS | Caught Stealing |
| AVG | Batting Average |

#### Batting - Advanced
| Stat | Description |
|------|-------------|
| BB% | Walk Rate |
| K% | Strikeout Rate |
| BB/K | Walk to Strikeout Ratio |
| OBP | On-Base Percentage |
| SLG | Slugging Percentage |
| OPS | On-Base Plus Slugging |
| ISO | Isolated Power |
| BABIP | Batting Average on Balls in Play |
| wOBA | Weighted On-Base Average |
| wRC+ | Weighted Runs Created Plus |
| Spd | Speed Score |

#### Batting - Batted Ball
| Stat | Description |
|------|-------------|
| GB/FB | Ground Ball to Fly Ball Ratio |
| LD% | Line Drive Percentage |
| GB% | Ground Ball Percentage |
| FB% | Fly Ball Percentage |
| IFFB% | Infield Fly Ball Percentage |
| HR/FB | Home Run to Fly Ball Ratio |
| Pull% | Pull Percentage |
| Cent% | Center Percentage |
| Oppo% | Opposite Field Percentage |
| Soft% | Soft Contact Percentage |
| Med% | Medium Contact Percentage |
| Hard% | Hard Contact Percentage |

#### Pitching - Dashboard
| Stat | Description |
|------|-------------|
| W | Wins |
| L | Losses |
| SV | Saves |
| G | Games |
| GS | Games Started |
| IP | Innings Pitched |
| K/9 | Strikeouts per 9 Innings |
| BB/9 | Walks per 9 Innings |
| HR/9 | Home Runs per 9 Innings |
| BABIP | Batting Average on Balls in Play |
| LOB% | Left On Base Percentage |
| ERA | Earned Run Average |
| FIP | Fielding Independent Pitching |
| xFIP | Expected FIP |

#### Pitching - Standard
| Stat | Description |
|------|-------------|
| W | Wins |
| L | Losses |
| SV | Saves |
| HLD | Holds |
| BS | Blown Saves |
| G | Games |
| GS | Games Started |
| CG | Complete Games |
| ShO | Shutouts |
| IP | Innings Pitched |
| H | Hits Allowed |
| R | Runs Allowed |
| ER | Earned Runs |
| HR | Home Runs Allowed |
| BB | Walks |
| SO | Strikeouts |
| HBP | Hit Batters |

#### Pitching - Advanced
| Stat | Description |
|------|-------------|
| K% | Strikeout Rate |
| BB% | Walk Rate |
| K-BB% | K% minus BB% |
| HR/FB | Home Run to Fly Ball Ratio |
| WHIP | Walks + Hits per Inning Pitched |
| BABIP | Batting Average on Balls in Play |
| ERA | Earned Run Average |
| FIP | Fielding Independent Pitching |
| xFIP | Expected FIP |
| ERA- | ERA Minus (100 is league average) |
| FIP- | FIP Minus (100 is league average) |

### 6.3 Baseball Savant / Statcast

Statcast data for MiLB is available via Baseball Savant's MiLB search. Coverage:
- **AAA**: Full tracking since 2023
- **AA**: Expanding (partial)
- **High-A Florida State League**: Since 2021
- **Other levels**: Not yet available

Key Statcast metrics:
| Metric | Description |
|--------|-------------|
| EV | Exit Velocity (mph) |
| LA | Launch Angle (degrees) |
| Barrel% | Barrel rate |
| HardHit% | 95+ mph contact rate |
| xBA | Expected Batting Average |
| xSLG | Expected Slugging |
| xwOBA | Expected wOBA |
| Sprint Speed | Feet per second |

---

## 7. Data Model (TypeScript)

### 7.1 Core Types

```typescript
// types/index.ts

export interface Player {
  fangraphsId: string;
  mlbamId?: string;
  name: string;
  team: string;
  org: string;
  level: 'AAA' | 'AA' | 'A+' | 'A' | 'CPX';
  position: string;
  bats?: 'L' | 'R' | 'S';
  throws?: 'L' | 'R';
  age?: number;
  hasStatcast: boolean;
}

export interface Team {
  id: string;
  name: string;
  leagueName?: string;
  platform?: string;
  isWatchlist: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamPlayer {
  id: string;
  teamId: string;
  playerId: string; // fangraphsId
  userNotes?: string;
  addedAt: Date;
}

export interface BattingStats {
  // Counting
  G?: number;
  PA?: number;
  AB?: number;
  H?: number;
  '2B'?: number;
  '3B'?: number;
  HR?: number;
  R?: number;
  RBI?: number;
  BB?: number;
  SO?: number;
  SB?: number;
  CS?: number;
  
  // Rate
  AVG?: number;
  OBP?: number;
  SLG?: number;
  OPS?: number;
  ISO?: number;
  'BB%'?: number;
  'K%'?: number;
  BABIP?: number;
  wOBA?: number;
  'wRC+'?: number;
  
  // Batted Ball
  'GB%'?: number;
  'FB%'?: number;
  'LD%'?: number;
  'Hard%'?: number;
  
  // Statcast
  EV?: number;
  LA?: number;
  'Barrel%'?: number;
  xBA?: number;
  xSLG?: number;
  xwOBA?: number;
}

export interface PitchingStats {
  // Counting
  G?: number;
  GS?: number;
  W?: number;
  L?: number;
  SV?: number;
  IP?: number;
  H?: number;
  R?: number;
  ER?: number;
  HR?: number;
  BB?: number;
  SO?: number;
  
  // Rate
  ERA?: number;
  WHIP?: number;
  'K/9'?: number;
  'BB/9'?: number;
  'K%'?: number;
  'BB%'?: number;
  FIP?: number;
  xFIP?: number;
  BABIP?: number;
  
  // Statcast
  Velo?: number;
  SpinRate?: number;
  'Whiff%'?: number;
}

export interface PlayerStatsData {
  type: 'batter' | 'pitcher';
  season: BattingStats | PitchingStats;
  splits: {
    last7?: BattingStats | PitchingStats;
    last14?: BattingStats | PitchingStats;
    last30?: BattingStats | PitchingStats;
  };
  games: GameLog[];
}

export interface GameLog {
  Date: string;
  Team: string;
  Opp: string;
  // ... varies by batter/pitcher
  [key: string]: any;
}

export type Split = 'season' | 'last7' | 'last14' | 'last30' | 'today' | 'yesterday';
```

### 7.2 Dexie.js Database Schema

```typescript
// db/index.ts
import Dexie, { Table } from 'dexie';

export interface DBTeam {
  id?: string;
  name: string;
  leagueName?: string;
  platform?: string;
  isWatchlist: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DBTeamPlayer {
  id?: string;
  teamId: string;
  playerId: string;
  userNotes?: string;
  addedAt: Date;
}

export interface DBSettings {
  key: string;
  value: any;
}

export class MiLBDatabase extends Dexie {
  teams!: Table<DBTeam>;
  teamPlayers!: Table<DBTeamPlayer>;
  settings!: Table<DBSettings>;

  constructor() {
    super('milb-stats-tracker');
    
    this.version(1).stores({
      teams: '++id, name, isWatchlist, displayOrder',
      teamPlayers: '++id, teamId, playerId, [teamId+playerId]',
      settings: 'key',
    });
  }
}

export const db = new MiLBDatabase();
```

---

## 8. User Interface

### 8.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Logo | Search | Settings | Last Updated: 2h ago        │
├─────────────────────────────────────────────────────────────────┤
│ Tab Bar: [Team 1] [Team 2] [Team 3] [Watchlist] [+ Add Team]   │
├─────────────────────────────────────────────────────────────────┤
│ Controls: [Split Selector ▼] [Categories ▼] [+ Add Player]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stats Table                                                    │
│  ┌────────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐   │
│  │ Player │ Lvl │ PA  │ AVG │ OBP │ SLG │ HR  │ wRC+│ EV  │   │
│  ├────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤   │
│  │ J.Doe  │ AAA │ 125 │.298 │.380 │.520 │ 8   │ 135 │ 92.1│   │
│  │ A.Smith│ AA  │ 98  │.275 │.350 │.445 │ 5   │ 118 │ --  │   │
│  └────────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Key UI Components

#### 8.2.1 Team Tab Bar
- Draggable tabs for reordering
- Right-click context menu (rename, delete)
- "+" button for new team
- Watchlist tab always last (or pinned)

#### 8.2.2 Split Selector
- Dropdown with preset options
- "Custom Range" opens date picker modal
- Selected split persists per session

#### 8.2.3 Category Toggle
- Checkbox dropdown for stat categories
- Group headers: Standard | Advanced | Statcast
- "Select All" / "Deselect All" options

#### 8.2.4 Stats Table
- Sortable columns (click header)
- Sticky header on scroll
- Player name links to expanded view
- Statcast badge/indicator per player
- "--" for unavailable data
- Hover tooltip for stat definitions

#### 8.2.5 Player Detail Modal
- Full stat breakdown
- All available splits
- Notes editor
- Comparison button
- External links (FanGraphs, Savant profiles)

#### 8.2.6 CSV Upload Modal
- Drag-and-drop zone
- Column mapping interface
- Preview of import
- Error highlighting for unmatched players

### 8.3 Responsive Design
- Desktop-first design
- Tablet: Collapsible sidebar, scrollable table
- Mobile: Card-based layout, swipeable tabs

---

## 9. Development Phases

### Phase 1: MVP (3-4 weeks)
- [ ] Project setup (Vite + React + TypeScript + Tailwind)
- [ ] GitHub Actions pipeline setup
- [ ] Python data fetcher with pybaseball
- [ ] IndexedDB setup with Dexie.js
- [ ] Team CRUD operations (create, rename, delete, reorder)
- [ ] Watchlist functionality
- [ ] Manual player add (from pre-fetched data)
- [ ] CSV upload for bulk player import
- [ ] Stats display (Dashboard, Standard, Advanced)
- [ ] Preset time splits (7d, 14d, 30d, Season)
- [ ] Basic stats table UI with sorting
- [ ] GitHub Pages deployment

### Phase 2: Enhanced Stats (2-3 weeks)
- [ ] Statcast data integration
- [ ] Player ID mapping (FanGraphs ↔ Savant)
- [ ] Statcast availability indicator per player
- [ ] Batted Ball stat category
- [ ] Custom date range selector
- [ ] Data export to CSV
- [ ] "Last updated" indicator

### Phase 3: Polish & UX (2 weeks)
- [ ] Dark mode
- [ ] Mobile responsive design
- [ ] Player comparison tool (side-by-side)
- [ ] Trend indicators (up/down arrows)
- [ ] Error handling improvements
- [ ] Loading states and skeleton UI
- [ ] Player detail modal/drawer

### Phase 4: Advanced Features (3-4 weeks, optional)
- [ ] Rolling average charts (Recharts)
- [ ] Additional splits (vs LHP/RHP, Home/Away)
- [ ] Alert system (browser notifications)
- [ ] Import/export full app data (backup)
- [ ] PWA support (offline capable)

---

## 10. Open Questions

1. **Player ID reconciliation**: Best source for FanGraphs ↔ Savant ID mapping?
   - Chadwick Bureau register?
   - Manual mapping table?
   - Fuzzy name matching?

2. **Data freshness expectations**: How often do users expect updates?
   - Current plan: Every 4 hours during season
   - Manual refresh via workflow_dispatch available

3. **Statcast expansion**: How to handle mid-season Statcast availability changes?
   - Check dynamically per player?
   - Maintain coverage map?

4. **Storage limits**: What happens when JSON files grow large?
   - Prune old game logs after season?
   - Compress data?

5. **Private vs Public**: Should the repo be public or private?
   - Public: Free GitHub Pages, Actions minutes
   - Private: Need to configure Pages differently

---

## 11. Success Metrics

- Initial page load < 2 seconds
- Stats data freshness within 4 hours during season
- CSV upload processing < 10 seconds for 50 players
- Works offline after initial data load
- Full functionality on desktop, tablet, mobile
- GitHub Actions runs reliably (>95% success rate)

---

## Appendix A: Sample CSV Format

```csv
name,fangraphs_id,position,notes
"Jackson Holliday",sa3014981,SS,Top prospect
"James Wood",sa3012912,OF,Power potential
"Marcelo Mayer",sa3010417,SS,
```

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| Split | A filtered view of statistics over a specific time period or situation |
| Statcast | MLB's tracking technology measuring player movements and ball flight |
| wRC+ | Weighted Runs Created Plus; 100 is league average |
| xwOBA | Expected Weighted On-Base Average based on quality of contact |
| Barrel | Batted ball with optimal exit velocity and launch angle combination |
| FIP | Fielding Independent Pitching; estimates ERA based on K, BB, HR |
| ISO | Isolated Power; SLG minus AVG, measures raw power |

## Appendix C: pybaseball Quick Reference

```python
import pybaseball as pyb

# Enable caching (recommended)
pyb.cache.enable()

# Player lookup
results = pyb.playerid_lookup('last_name', 'first_name')

# MiLB batting game logs
batting = pyb.milb_batter_game_logs_fg('sa3014981', 2025)

# MiLB pitching game logs  
pitching = pyb.milb_pitcher_game_logs_fg('sa3014981', 2025)

# MLB Statcast (for reference - different from MiLB)
statcast = pyb.statcast(start_dt='2025-04-01', end_dt='2025-04-30')
```

---

*Document maintained by: [Your Name]*  
*Next review date: [Date]*
