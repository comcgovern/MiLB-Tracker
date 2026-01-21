# Data Directory

## Files

- **player-index.json** - Complete index of all MiLB players, rebuilt weekly
- **stats/** - Player statistics by season (e.g., 2024.json, 2025.json)
- **game-logs/** - Individual game logs for each player
- **statcast/** - Statcast metrics for players with MLB experience
- **meta.json** - Metadata about last update time and player count

## How Stats Are Fetched

Stats are automatically fetched for **all players in player-index.json** via scheduled GitHub Actions workflows:
- Every 4 hours during the season (April-September)
- Daily during the off-season (October-March)

No separate player registry is needed - if a player is in the player index, their stats will be fetched.

## Building the Player Index

The player index is automatically rebuilt weekly via the `build-player-index.yml` workflow, which:
1. Fetches all active MiLB rosters from MLB Stats API
2. Compiles a searchable index with ~6,000+ players
3. Includes team, organization, level, and position info

You can also manually trigger the rebuild via GitHub Actions.
