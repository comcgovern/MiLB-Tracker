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

from mlbstatsapi import Mlb

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


def get_milb_players_for_level(mlb: Mlb, year: int, sport_id: int) -> list[dict]:
    """Fetch all players for a specific MiLB level using MLB Stats API."""
    players = []
    level_name = SPORT_ID_TO_LEVEL.get(sport_id, 'Unknown')

    try:
        # Get all teams for this sport/level
        teams = mlb.get_teams(sport_id=sport_id, season=year)

        if not teams:
            logger.debug(f"No teams found for sport_id {sport_id} in {year}")
            return players

        for team in teams:
            team_id = team.id
            team_name = team.name or 'Unknown'

            # Get parent org info from team object
            parent_org = ''
            if hasattr(team, 'parent_org_name') and team.parent_org_name:
                parent_org = team.parent_org_name[:3].upper()

            try:
                # Get the roster for this team
                roster = mlb.get_team_roster(team_id, season=year)

                if not roster:
                    continue

                for player in roster:
                    player_id = player.id if hasattr(player, 'id') else None
                    if not player_id:
                        continue

                    # Get player name
                    full_name = player.fullname if hasattr(player, 'fullname') else ''
                    if not full_name:
                        full_name = player.full_name if hasattr(player, 'full_name') else ''

                    # Get position
                    pos_abbrev = 'UTIL'
                    if hasattr(player, 'primaryposition') and player.primaryposition:
                        pos_abbrev = player.primaryposition.abbreviation or 'UTIL'
                    elif hasattr(player, 'primary_position') and player.primary_position:
                        pos_abbrev = player.primary_position.abbreviation or 'UTIL'

                    player_type = 'pitcher' if pos_abbrev == 'P' else 'batter'

                    players.append({
                        'player_id': str(player_id),
                        'name': full_name,
                        'team': team_name,
                        'org': parent_org,
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


def get_milb_players(mlb: Mlb, year: int) -> list[dict]:
    """Fetch all MiLB players for a year using MLB Stats API."""
    all_players = []

    for level_name, sport_id in MILB_LEVELS.items():
        logger.info(f"Fetching {level_name} players for {year}...")
        players = get_milb_players_for_level(mlb, year, sport_id)
        all_players.extend(players)
        logger.info(f"  Found {len(players)} players at {level_name}")

    return all_players


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

    # Initialize the MLB API client
    mlb = Mlb()

    existing_ids = load_existing_players()

    # Try to get MiLB players for the requested year
    all_players = get_milb_players(mlb, year)

    # If no data found, try the fallback year
    year_used = year
    if not all_players:
        logger.warning(f"No data found for {year}, trying {fallback_year}...")
        all_players = get_milb_players(mlb, fallback_year)
        year_used = fallback_year

    if not all_players:
        logger.warning(f"No players found for {year_used}")
        return [], year_used

    # Deduplicate and build player index
    players = {}
    for p in all_players:
        player_id = p['player_id']
        if not player_id or player_id == 'nan':
            continue

        name = p.get('name', '')
        if not name:
            continue

        # Skip if already added (keep first occurrence - typically higher level)
        if player_id in players:
            continue

        players[player_id] = {
            'mlbId': player_id,
            'name': name,
            'team': p.get('team', 'Unknown'),
            'org': p.get('org', ''),
            'level': p.get('level', 'A+'),
            'position': p.get('position', 'UTIL'),
            'type': p.get('type', 'batter'),
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
