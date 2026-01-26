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


def get_player_activity_by_year() -> dict[str, dict]:
    """
    Scan all stats files to find activity information for each player.

    Returns:
        Dict mapping player_id -> {
            'last_game_date': str (YYYY-MM-DD),
            'years_active': set of years with activity,
            'player_info': basic info from stats if available
        }
    """
    player_activity = {}

    if not STATS_DIR.exists():
        logger.warning(f"Stats directory not found: {STATS_DIR}")
        return player_activity

    # Scan all year directories
    for year_dir in STATS_DIR.iterdir():
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue

        year = int(year_dir.name)

        # Scan all month files in the year
        for month_file in year_dir.glob('[0-9][0-9].json'):
            try:
                with open(month_file) as f:
                    data = json.load(f)

                players = data.get('players', {})
                for player_id, player_data in players.items():
                    if player_id not in player_activity:
                        player_activity[player_id] = {
                            'last_game_date': None,
                            'years_active': set(),
                            'player_info': None,
                        }

                    player_type = player_data.get('type', 'batter')

                    # Check batting game logs
                    for log in player_data.get('battingGameLog', []):
                        game_date = log.get('date', '')
                        if game_date:
                            player_activity[player_id]['years_active'].add(year)
                            if (player_activity[player_id]['last_game_date'] is None or
                                    game_date > player_activity[player_id]['last_game_date']):
                                player_activity[player_id]['last_game_date'] = game_date
                            # Extract player info from game log if not already set
                            if player_activity[player_id]['player_info'] is None:
                                player_activity[player_id]['player_info'] = {
                                    'team': log.get('team', 'Unknown'),
                                    'level': log.get('level', 'Unknown'),
                                    'type': player_type,
                                }

                    # Check pitching game logs
                    for log in player_data.get('pitchingGameLog', []):
                        game_date = log.get('date', '')
                        if game_date:
                            player_activity[player_id]['years_active'].add(year)
                            if (player_activity[player_id]['last_game_date'] is None or
                                    game_date > player_activity[player_id]['last_game_date']):
                                player_activity[player_id]['last_game_date'] = game_date
                            # Extract player info from game log if not already set
                            if player_activity[player_id]['player_info'] is None:
                                player_activity[player_id]['player_info'] = {
                                    'team': log.get('team', 'Unknown'),
                                    'level': log.get('level', 'Unknown'),
                                    'type': player_type,
                                }

                    # Also check for explicit info field (legacy support)
                    if player_activity[player_id]['player_info'] is None:
                        info = player_data.get('info', {})
                        if info:
                            player_activity[player_id]['player_info'] = info

            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Failed to read {month_file}: {e}")
                continue

    logger.info(f"Found activity data for {len(player_activity)} players")
    return player_activity


def get_player_last_game_dates() -> dict[str, str]:
    """
    Scan all stats files to find the most recent game date for each player.
    (Legacy function for backward compatibility)

    Returns:
        Dict mapping player_id -> last_game_date (YYYY-MM-DD format)
    """
    activity = get_player_activity_by_year()
    return {pid: data['last_game_date'] for pid, data in activity.items()
            if data['last_game_date'] is not None}


def prune_inactive_players_by_season(players: list[dict], player_activity: dict[str, dict],
                                      current_year: int) -> list[dict]:
    """
    Remove players who haven't played in the current or previous season.

    Players are kept if they:
    - Have activity in the current year OR previous year (from stats files)
    - Are on a current roster but have no stats yet (new players)

    Args:
        players: List of player dicts from the index
        player_activity: Dict mapping player_id -> activity info with years_active
        current_year: The current year for determining seasons

    Returns:
        Filtered list of active players
    """
    previous_year = current_year - 1
    valid_years = {current_year, previous_year}

    active_players = []
    pruned_count = 0
    no_data_count = 0

    for player in players:
        player_id = player.get('mlbId', '')
        activity = player_activity.get(player_id)

        if activity is None:
            # No game data found - keep the player (they might be new to the system)
            active_players.append(player)
            no_data_count += 1
        else:
            years_active = activity.get('years_active', set())
            # Keep if player was active in current or previous year
            if years_active & valid_years:
                if activity['last_game_date']:
                    player['lastGameDate'] = activity['last_game_date']
                active_players.append(player)
            else:
                # Player hasn't played in current or previous season - prune them
                pruned_count += 1
                logger.debug(f"Pruning inactive player: {player.get('name')} "
                           f"(last active years: {sorted(years_active) if years_active else 'none'})")

    logger.info(f"Pruned {pruned_count} inactive players (no activity in {previous_year} or {current_year})")
    logger.info(f"Kept {len(active_players)} players ({no_data_count} with no game data)")

    return active_players


def prune_inactive_players(players: list[dict], last_game_dates: dict[str, str],
                           threshold_days: int = INACTIVE_THRESHOLD_DAYS) -> list[dict]:
    """
    Remove players who haven't played a MiLB game within the threshold period.
    (Legacy function - prefer prune_inactive_players_by_season)

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


def load_existing_index() -> dict[str, dict]:
    """Load existing player index to get player names and info.

    Returns:
        Dict mapping player_id -> player info dict
    """
    if INDEX_FILE.exists():
        try:
            with open(INDEX_FILE) as f:
                data = json.load(f)
                return {p['mlbId']: p for p in data.get('players', [])}
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Failed to load existing index: {e}")
    return {}


def build_index(year: int = None, fallback_year: int = None,
                prune_inactive: bool = True,
                prune_threshold_days: int = INACTIVE_THRESHOLD_DAYS) -> tuple[list[dict], int]:
    """Build the player index from MLB Stats API data.

    Fetches players from both current and previous year rosters, and includes
    players from stats files who have activity in current or previous year.
    This ensures players who moved to MLB 40-man rosters are still included
    if they played in the minors recently.

    Args:
        year: The year to fetch data for. Defaults to current year.
        fallback_year: Previous year for including players from last season.
        prune_inactive: If True, remove players who haven't played in current or last season.
        prune_threshold_days: Legacy parameter, not used with season-based pruning.

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

    # Get player activity from stats files first (needed for both inclusion and pruning)
    logger.info("Scanning stats files for player activity...")
    player_activity = get_player_activity_by_year()

    # Fetch players from BOTH current and previous year rosters
    # This ensures we catch players who were on MiLB rosters in either season
    logger.info(f"Fetching rosters for {year} and {fallback_year}...")

    all_players = []

    # Try current year first
    current_year_players = get_milb_players(mlb, year)
    all_players.extend(current_year_players)
    logger.info(f"Found {len(current_year_players)} players from {year} rosters")

    # Also fetch previous year to catch players who may have moved to MLB
    previous_year_players = get_milb_players(mlb, fallback_year)
    all_players.extend(previous_year_players)
    logger.info(f"Found {len(previous_year_players)} players from {fallback_year} rosters")

    year_used = year

    # Deduplicate and build player index from roster data
    # Keep first occurrence (current year takes priority over previous year)
    players = {}
    for p in all_players:
        player_id = p['player_id']
        if not player_id or player_id == 'nan':
            continue

        name = p.get('name', '')
        if not name:
            continue

        # Skip if already added (keep first occurrence - current year or higher level)
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

    logger.info(f"Built index with {len(players)} players from rosters")

    # Load existing index to get player names for stats-only players
    existing_index = load_existing_index()
    logger.info(f"Loaded {len(existing_index)} players from existing index for name lookup")

    # Add players from stats files who have activity in current or previous year
    # but are not on any roster (e.g., players who moved to MLB 40-man)
    valid_years = {year, fallback_year}
    stats_only_count = 0
    missing_name_count = 0

    for player_id, activity in player_activity.items():
        if player_id in players:
            continue  # Already have this player from roster data

        # Check if player was active in current or previous year
        years_active = activity.get('years_active', set())
        if not (years_active & valid_years):
            continue  # No recent activity

        # Get player info from stats files
        player_info = activity.get('player_info', {})

        # Try to get name from existing index first, then from player_info
        existing_player = existing_index.get(player_id, {})
        name = existing_player.get('name', '') or player_info.get('name', '')

        if not name:
            missing_name_count += 1
            continue  # Can't add player without a name

        # Prefer data from existing index, fall back to stats data
        players[player_id] = {
            'mlbId': player_id,
            'name': name,
            'team': player_info.get('team') or existing_player.get('team', 'Unknown'),
            'org': existing_player.get('org', ''),  # org not in stats, use existing
            'level': player_info.get('level') or existing_player.get('level', 'Unknown'),
            'position': existing_player.get('position', 'UTIL'),  # position not in stats
            'type': player_info.get('type') or existing_player.get('type', 'batter'),
            'inRegistry': player_id in existing_ids,
        }
        stats_only_count += 1

    if stats_only_count > 0:
        logger.info(f"Added {stats_only_count} players from stats files (not on current rosters)")
    if missing_name_count > 0:
        logger.warning(f"Skipped {missing_name_count} players from stats (no name available)")

    result = list(players.values())
    logger.info(f"Total index size before pruning: {len(result)} players")

    # Prune inactive players using season-based logic
    if prune_inactive:
        logger.info("Checking for inactive players to prune (season-based)...")
        result = prune_inactive_players_by_season(result, player_activity, year)

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
