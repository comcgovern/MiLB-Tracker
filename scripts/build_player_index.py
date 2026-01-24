#!/usr/bin/env python3
"""
scripts/build_player_index.py
Build a searchable index of all MiLB players from the MLB Stats API.
This creates a static JSON file that the frontend can use to search for players.

Includes pruning logic to remove players who haven't played a MiLB game
in over a year.
"""

import argparse
import json
import logging
from datetime import datetime, timedelta
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
STATS_DIR = DATA_DIR / 'stats'

# Pruning threshold - players inactive for more than this many days are removed
INACTIVE_THRESHOLD_DAYS = 365

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


def get_player_last_game_dates() -> dict[str, str]:
    """
    Scan all stats files to find the most recent game date for each player.

    Returns:
        Dict mapping player_id -> last_game_date (YYYY-MM-DD format)
    """
    last_game_dates = {}

    if not STATS_DIR.exists():
        logger.warning(f"Stats directory not found: {STATS_DIR}")
        return last_game_dates

    # Scan all year directories
    for year_dir in STATS_DIR.iterdir():
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue

        # Scan all month files in the year
        for month_file in year_dir.glob('[0-9][0-9].json'):
            try:
                with open(month_file) as f:
                    data = json.load(f)

                players = data.get('players', {})
                for player_id, player_data in players.items():
                    # Check batting game logs
                    for log in player_data.get('battingGameLog', []):
                        game_date = log.get('date', '')
                        if game_date:
                            if player_id not in last_game_dates or game_date > last_game_dates[player_id]:
                                last_game_dates[player_id] = game_date

                    # Check pitching game logs
                    for log in player_data.get('pitchingGameLog', []):
                        game_date = log.get('date', '')
                        if game_date:
                            if player_id not in last_game_dates or game_date > last_game_dates[player_id]:
                                last_game_dates[player_id] = game_date

            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to read {month_file}: {e}")
                continue

    logger.info(f"Found last game dates for {len(last_game_dates)} players")
    return last_game_dates


def prune_inactive_players(players: list[dict], last_game_dates: dict[str, str],
                           threshold_days: int = INACTIVE_THRESHOLD_DAYS) -> list[dict]:
    """
    Remove players who haven't played a MiLB game within the threshold period.

    Args:
        players: List of player dicts from the index
        last_game_dates: Dict mapping player_id -> last_game_date
        threshold_days: Number of days of inactivity before pruning

    Returns:
        Filtered list of active players
    """
    cutoff_date = (datetime.now() - timedelta(days=threshold_days)).strftime('%Y-%m-%d')

    active_players = []
    pruned_count = 0
    no_data_count = 0

    for player in players:
        player_id = player.get('mlbId', '')
        last_game = last_game_dates.get(player_id)

        if last_game is None:
            # No game data found - keep the player (they might be new)
            # But we could also choose to prune these if we wanted stricter filtering
            active_players.append(player)
            no_data_count += 1
        elif last_game >= cutoff_date:
            # Player has played recently - keep them
            player['lastGameDate'] = last_game
            active_players.append(player)
        else:
            # Player hasn't played in over a year - prune them
            pruned_count += 1
            logger.debug(f"Pruning inactive player: {player.get('name')} (last game: {last_game})")

    logger.info(f"Pruned {pruned_count} inactive players (no game in {threshold_days} days)")
    logger.info(f"Kept {len(active_players)} players ({no_data_count} with no game data)")

    return active_players


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


def build_index(year: int = None, fallback_year: int = None,
                prune_inactive: bool = True,
                prune_threshold_days: int = INACTIVE_THRESHOLD_DAYS) -> tuple[list[dict], int]:
    """Build the player index from MLB Stats API data.

    Args:
        year: The year to fetch data for. Defaults to current year.
        fallback_year: Year to fall back to if primary year has no data.
        prune_inactive: If True, remove players who haven't played in over a year.
        prune_threshold_days: Number of days of inactivity before pruning.

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

    # Prune inactive players if enabled
    if prune_inactive:
        logger.info("Checking for inactive players to prune...")
        last_game_dates = get_player_last_game_dates()
        result = prune_inactive_players(result, last_game_dates, prune_threshold_days)

    return result, year_used


def main():
    parser = argparse.ArgumentParser(description='Build MiLB player index')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year to fetch (default: current year)')
    parser.add_argument('--fallback-year', type=int, default=None,
                        help='Year to use if primary year has no data (default: year-1)')
    parser.add_argument('--output', type=str,
                        help='Output file path (default: data/player-index.json)')
    parser.add_argument('--no-prune', action='store_true',
                        help='Disable pruning of inactive players')
    parser.add_argument('--prune-days', type=int, default=INACTIVE_THRESHOLD_DAYS,
                        help=f'Days of inactivity before pruning (default: {INACTIVE_THRESHOLD_DAYS})')

    args = parser.parse_args()

    # Build index (will fallback to previous year if needed)
    players, year_used = build_index(args.year, args.fallback_year,
                                     prune_inactive=not args.no_prune,
                                     prune_threshold_days=args.prune_days)

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
