#!/usr/bin/env python3
"""
scripts/build_player_index.py
Build a searchable index of all MiLB players from the MLB Stats API.
This creates a static JSON file that the frontend can use to search for players.
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
import statsapi

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Paths
DATA_DIR = Path(__file__).parent.parent / 'data'
INDEX_FILE = DATA_DIR / 'player-index.json'
PLAYERS_FILE = DATA_DIR / 'players.json'

# MiLB levels and their MLB Stats API sport IDs
MILB_LEVELS = {
    'AAA': 11,   # Triple-A
    'AA': 12,    # Double-A
    'A+': 13,    # High-A
    'A': 14,     # Single-A
    'CPX': 16,   # Rookie/Complex
}

# Reverse mapping for sport_id to level name
SPORT_ID_TO_LEVEL = {v: k for k, v in MILB_LEVELS.items()}


def get_milb_players_for_level(year: int, sport_id: int) -> list[dict]:
    """Fetch all players for a specific MiLB level using MLB Stats API."""
    players = []
    level_name = SPORT_ID_TO_LEVEL.get(sport_id, 'Unknown')

    try:
        # Get all teams for this sport/level
        teams_data = statsapi.get('teams', {'sportId': sport_id, 'season': year})
        teams = teams_data.get('teams', [])

        for team in teams:
            team_id = team.get('id')
            team_name = team.get('name', 'Unknown')
            parent_org = team.get('parentOrgName', '')
            parent_org_abbrev = team.get('parentOrgId', '')

            try:
                # Get the 40-man roster for this team (includes all players)
                roster_data = statsapi.get('team_roster', {
                    'teamId': team_id,
                    'season': year,
                    'rosterType': 'fullSeason'
                })

                roster = roster_data.get('roster', [])
                for player_entry in roster:
                    person = player_entry.get('person', {})
                    position = player_entry.get('position', {})

                    player_id = person.get('id')
                    if not player_id:
                        continue

                    pos_abbrev = position.get('abbreviation', 'UTIL')
                    player_type = 'pitcher' if pos_abbrev == 'P' else 'batter'

                    players.append({
                        'player_id': str(player_id),
                        'name': person.get('fullName', ''),
                        'team': team_name,
                        'org': parent_org[:3].upper() if parent_org else '',
                        'level': level_name,
                        'position': pos_abbrev,
                        'type': player_type,
                    })
            except Exception as e:
                logger.debug(f"Failed to fetch roster for {team_name}: {e}")
                continue

    except Exception as e:
        logger.warning(f"Failed to fetch teams for sport_id {sport_id}: {e}")

    return players


def get_milb_stats(year: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Fetch all MiLB player data for a year using MLB Stats API."""
    all_players = []

    for level_name, sport_id in MILB_LEVELS.items():
        logger.info(f"Fetching {level_name} players for {year}...")
        players = get_milb_players_for_level(year, sport_id)
        all_players.extend(players)
        logger.info(f"  Found {len(players)} players at {level_name}")

    if not all_players:
        logger.warning(f"No players found for {year}")
        return pd.DataFrame(), pd.DataFrame()

    df = pd.DataFrame(all_players)

    # Split into batters and pitchers
    batters = df[df['type'] == 'batter'].copy()
    pitchers = df[df['type'] == 'pitcher'].copy()

    logger.info(f"Total: {len(batters)} batters, {len(pitchers)} pitchers")
    return batters, pitchers


def load_existing_players() -> set:
    """Load existing player IDs from the registry."""
    if PLAYERS_FILE.exists():
        with open(PLAYERS_FILE) as f:
            data = json.load(f)
            ids = set()
            for p in data.get('players', []):
                # Support both mlbId and legacy fangraphsId
                if 'mlbId' in p:
                    ids.add(p['mlbId'])
                if 'fangraphsId' in p:
                    ids.add(p['fangraphsId'])
            return ids
    return set()


def build_index(year: int = None, fallback_year: int = None) -> tuple[list[dict], int]:
    """Build the player index from MLB Stats API data.

    Args:
        year: The year to fetch data for. Defaults to current year.
        fallback_year: Year to fall back to if primary year has no data.

    Returns:
        Tuple of (player list, year used)
    """
    if year is None:
        year = datetime.now().year

    if fallback_year is None:
        fallback_year = year - 1

    players = {}
    existing_ids = load_existing_players()

    # Try to get MiLB stats for the requested year
    batters, pitchers = get_milb_stats(year)

    # If no data found, try the fallback year
    year_used = year
    if (batters is None or batters.empty) and (pitchers is None or pitchers.empty):
        logger.warning(f"No data found for {year}, trying {fallback_year}...")
        batters, pitchers = get_milb_stats(fallback_year)
        year_used = fallback_year

    # Process batters
    if batters is not None and not batters.empty:
        logger.info(f"Processing {len(batters)} batters...")
        for _, row in batters.iterrows():
            player_id = str(row.get('player_id', ''))
            if not player_id or player_id == 'nan':
                continue

            name = row.get('name', '')
            if pd.isna(name) or not name:
                continue

            level = row.get('level', 'A+')
            team = row.get('team', 'Unknown')
            org = row.get('org', '')
            pos = row.get('position', 'UTIL')

            players[player_id] = {
                'mlbId': player_id,
                'name': str(name),
                'team': team if team and team != 'nan' else 'Unknown',
                'org': org if org and org != 'NAN' else '',
                'level': level,
                'position': pos if pos else 'UTIL',
                'type': 'batter',
                'inRegistry': player_id in existing_ids,
            }

    # Process pitchers
    if pitchers is not None and not pitchers.empty:
        logger.info(f"Processing {len(pitchers)} pitchers...")
        for _, row in pitchers.iterrows():
            player_id = str(row.get('player_id', ''))
            if not player_id or player_id == 'nan':
                continue

            # Skip if already added as batter (two-way player)
            if player_id in players:
                continue

            name = row.get('name', '')
            if pd.isna(name) or not name:
                continue

            level = row.get('level', 'A+')
            team = row.get('team', 'Unknown')
            org = row.get('org', '')

            players[player_id] = {
                'mlbId': player_id,
                'name': str(name),
                'team': team if team and team != 'nan' else 'Unknown',
                'org': org if org and org != 'NAN' else '',
                'level': level,
                'position': 'P',
                'type': 'pitcher',
                'inRegistry': player_id in existing_ids,
            }

    result = list(players.values())
    logger.info(f"Built index with {len(result)} players for {year_used}")
    return result, year_used


def main():
    parser = argparse.ArgumentParser(description='Build MiLB player index')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year to fetch (default: current year)')
    parser.add_argument('--fallback-year', type=int, default=None,
                        help='Year to use if primary year has no data (default: year-1)')
    parser.add_argument('--output', type=str,
                        help='Output file path (default: data/player-index.json)')

    args = parser.parse_args()

    # Build index (will fallback to previous year if needed)
    players, year_used = build_index(args.year, args.fallback_year)

    if not players:
        logger.error("No players found. Index not created.")
        return

    # Prepare output
    output_data = {
        'players': players,
        'year': year_used,
        'requestedYear': args.year,
        'lastUpdated': datetime.now().isoformat(),
        'count': len(players),
    }

    # Save
    output_path = Path(args.output) if args.output else INDEX_FILE
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)

    logger.info(f"Saved index to {output_path}")
    if year_used != args.year:
        logger.info(f"Note: Used {year_used} data (requested {args.year} had no data)")


if __name__ == '__main__':
    main()
