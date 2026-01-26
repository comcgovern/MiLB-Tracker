#!/usr/bin/env python3
"""
Fetch MiLB play-by-play data from the MLB Stats API.

This script fetches detailed play-by-play data for MiLB games, which includes
pitch-level data with batter/pitcher matchup information needed for handedness splits.

Data is stored by date:
  data/pbp/{year}/{month}/{day}.json - All games for that day

Usage:
  # Fetch yesterday's games
  python fetch_pbp.py --yesterday

  # Fetch a specific date
  python fetch_pbp.py --date 2025-06-15

  # Fetch an entire month
  python fetch_pbp.py --month 2025-06

  # Fetch a full year (all season months April-September)
  python fetch_pbp.py --year 2025

  # Adjust worker count (default: 200)
  python fetch_pbp.py --month 2025-06 --workers 100
"""

import argparse
import json
import logging
import time
from calendar import monthrange
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Paths
DATA_DIR = Path(__file__).parent.parent / 'data'
PBP_DIR = DATA_DIR / 'pbp'

# API
MLB_API_BASE = 'https://statsapi.mlb.com/api/v1'
REQUEST_TIMEOUT = 60
MAX_RETRIES = 3
RETRY_DELAY = 2

# MiLB levels and their sport IDs
MILB_SPORT_IDS = {
    'AAA': 11,
    'AA': 12,
    'A+': 13,
    'A': 14,
    'CPX': 16,
}

# Reverse mapping: sport ID to level name
SPORT_ID_TO_LEVEL = {v: k for k, v in MILB_SPORT_IDS.items()}

# Season months (April = 4 through September = 9)
SEASON_MONTHS = [4, 5, 6, 7, 8, 9]


class APIClient:
    """Simple MLB Stats API client with retry logic."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Accept': 'application/json',
            'User-Agent': 'MiLB-Tracker/1.0'
        })

    def get(self, endpoint: str, params: dict = None) -> Optional[dict]:
        """GET request with retries."""
        url = f"{MLB_API_BASE}{endpoint}"

        for attempt in range(MAX_RETRIES):
            try:
                resp = self.session.get(url, params=params, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                return resp.json()
            except requests.exceptions.RequestException as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    logger.debug(f"Request failed after {MAX_RETRIES} attempts: {e}")
        return None


def get_games_for_date(client: APIClient, date: str) -> list[dict]:
    """Get all MiLB games scheduled for a specific date."""
    games = []
    sport_ids = ','.join(str(sid) for sid in MILB_SPORT_IDS.values())

    data = client.get('/schedule', params={
        'sportId': sport_ids,
        'date': date,
        'gameType': 'R',
        'hydrate': 'team'
    })

    if not data:
        return games

    for date_entry in data.get('dates', []):
        for game in date_entry.get('games', []):
            # Only include completed games
            status = game.get('status', {}).get('abstractGameState', '')
            if status == 'Final':
                games.append(game)

    return games


def get_level_from_game(game: dict) -> str:
    """Extract the MiLB level from a game object."""
    # Try to get sport ID from the game
    sport_id = game.get('sport', {}).get('id')
    if sport_id and sport_id in SPORT_ID_TO_LEVEL:
        return SPORT_ID_TO_LEVEL[sport_id]

    # Try from teams
    for team_type in ['away', 'home']:
        team = game.get('teams', {}).get(team_type, {}).get('team', {})
        sport = team.get('sport', {})
        sport_id = sport.get('id')
        if sport_id and sport_id in SPORT_ID_TO_LEVEL:
            return SPORT_ID_TO_LEVEL[sport_id]

    return 'MiLB'


def fetch_play_by_play(client: APIClient, game_pk: int) -> Optional[dict]:
    """Fetch play-by-play data for a single game."""
    return client.get(f'/game/{game_pk}/playByPlay')


def extract_at_bats(pbp_data: dict, game_info: dict) -> list[dict]:
    """
    Extract at-bat level data from play-by-play response.

    Returns a list of at-bat records with:
    - batterId, batterName, batterHand
    - pitcherId, pitcherName, pitcherHand
    - result, description
    - pitch count, outcome stats
    """
    at_bats = []

    if not pbp_data:
        return at_bats

    all_plays = pbp_data.get('allPlays', [])

    for play in all_plays:
        # Skip non-at-bat plays
        if play.get('type') != 'atBat':
            continue

        matchup = play.get('matchup', {})
        batter = matchup.get('batter', {})
        pitcher = matchup.get('pitcher', {})
        result = play.get('result', {})

        at_bat = {
            'batterId': batter.get('id'),
            'batterName': batter.get('fullName'),
            'batterHand': matchup.get('batSide', {}).get('code'),  # L, R, or S
            'pitcherId': pitcher.get('id'),
            'pitcherName': pitcher.get('fullName'),
            'pitcherHand': matchup.get('pitchHand', {}).get('code'),  # L or R
            'result': result.get('event'),
            'eventType': result.get('eventType'),
            'description': result.get('description'),
            'rbi': result.get('rbi', 0),
            'isOut': result.get('isOut', False),
        }

        # Extract pitch data if available
        pitches = play.get('playEvents', [])
        pitch_count = sum(1 for p in pitches if p.get('isPitch', False))
        at_bat['pitchCount'] = pitch_count

        # Count strikes and balls
        strikes = 0
        balls = 0
        for pitch in pitches:
            if pitch.get('isPitch'):
                call = pitch.get('details', {}).get('call', {}).get('code', '')
                if call in ['S', 'C', 'F', 'T', 'L', 'M', 'O', 'Q', 'R', 'W']:
                    strikes += 1
                elif call in ['B', 'I', 'P', 'V']:
                    balls += 1

        at_bat['strikes'] = strikes
        at_bat['balls'] = balls

        at_bats.append(at_bat)

    return at_bats


def process_game(game: dict, client: APIClient) -> Optional[dict]:
    """Process a single game and return its play-by-play data."""
    game_pk = game.get('gamePk')
    if not game_pk:
        return None

    pbp_data = fetch_play_by_play(client, game_pk)
    if not pbp_data:
        return None

    at_bats = extract_at_bats(pbp_data, game)

    if not at_bats:
        return None

    # Build game record
    teams = game.get('teams', {})
    away_team = teams.get('away', {}).get('team', {})
    home_team = teams.get('home', {}).get('team', {})

    return {
        'gamePk': game_pk,
        'date': game.get('officialDate') or game.get('gameDate', '')[:10],
        'level': get_level_from_game(game),
        'awayTeam': {
            'id': away_team.get('id'),
            'name': away_team.get('name'),
        },
        'homeTeam': {
            'id': home_team.get('id'),
            'name': home_team.get('name'),
        },
        'atBats': at_bats,
    }


def fetch_date(date_str: str, max_workers: int = 200) -> dict:
    """
    Fetch play-by-play data for all MiLB games on a specific date.

    Args:
        date_str: Date in YYYY-MM-DD format
        max_workers: Number of parallel workers (default: 200)

    Returns:
        Dict with date metadata and list of game records
    """
    client = APIClient()

    # Get all completed games for this date
    games = get_games_for_date(client, date_str)
    logger.info(f"Found {len(games)} completed games for {date_str}")

    if not games:
        return {
            'date': date_str,
            'updated': datetime.now().isoformat(),
            'gameCount': 0,
            'games': [],
        }

    # Fetch play-by-play for each game in parallel
    game_records = []
    failed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Each worker gets its own client for thread safety
        future_to_game = {}
        for game in games:
            game_client = APIClient()
            future = executor.submit(process_game, game, game_client)
            future_to_game[future] = game.get('gamePk')

        for future in as_completed(future_to_game):
            game_pk = future_to_game[future]
            try:
                result = future.result()
                if result:
                    game_records.append(result)
            except Exception as e:
                logger.warning(f"Failed to process game {game_pk}: {e}")
                failed += 1

    logger.info(f"Processed {len(game_records)} games, {failed} failed")

    return {
        'date': date_str,
        'updated': datetime.now().isoformat(),
        'gameCount': len(game_records),
        'games': game_records,
    }


def save_date_data(date_str: str, data: dict) -> None:
    """Save play-by-play data for a specific date."""
    year, month, day = date_str.split('-')

    # Create directory structure: data/pbp/{year}/{month}/
    date_dir = PBP_DIR / year / month
    date_dir.mkdir(parents=True, exist_ok=True)

    # Save as {day}.json
    output_file = date_dir / f'{day}.json'

    with open(output_file, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

    logger.info(f"Saved {data['gameCount']} games to {output_file}")


def update_manifest(year: int, months: list[int]) -> None:
    """Update the year's manifest file."""
    year_dir = PBP_DIR / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)

    # Find all days with data for each month
    months_data = {}
    for month in months:
        month_dir = year_dir / f'{month:02d}'
        if month_dir.exists():
            days = sorted([
                int(f.stem) for f in month_dir.glob('*.json')
                if f.stem.isdigit()
            ])
            if days:
                months_data[month] = days

    manifest = {
        'year': year,
        'updated': datetime.now().isoformat(),
        'months': months_data,
    }

    manifest_file = year_dir / 'manifest.json'
    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    logger.info(f"Updated manifest: {manifest_file}")


def get_dates_for_month(year: int, month: int) -> list[str]:
    """Get all dates in a month as YYYY-MM-DD strings."""
    _, last_day = monthrange(year, month)
    return [f'{year}-{month:02d}-{day:02d}' for day in range(1, last_day + 1)]


def main():
    parser = argparse.ArgumentParser(
        description='Fetch MiLB play-by-play data from MLB Stats API'
    )
    parser.add_argument('--date', type=str, help='Specific date (YYYY-MM-DD)')
    parser.add_argument('--month', type=str, help='Specific month (YYYY-MM)')
    parser.add_argument('--year', type=int, help='Full year (fetches April-September)')
    parser.add_argument('--yesterday', action='store_true', help='Fetch yesterday\'s games')
    parser.add_argument('--workers', type=int, default=200,
                        help='Number of parallel workers (default: 200)')
    parser.add_argument('--debug', action='store_true', help='Enable debug logging')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Determine which dates to fetch
    dates_to_fetch = []
    target_year = None
    target_months = set()

    if args.date:
        dates_to_fetch = [args.date]
        target_year = int(args.date.split('-')[0])
        target_months.add(int(args.date.split('-')[1]))
    elif args.month:
        year, month = map(int, args.month.split('-'))
        dates_to_fetch = get_dates_for_month(year, month)
        target_year = year
        target_months.add(month)
        # Only fetch up to today
        today = datetime.now().strftime('%Y-%m-%d')
        dates_to_fetch = [d for d in dates_to_fetch if d <= today]
    elif args.year:
        target_year = args.year
        for month in SEASON_MONTHS:
            dates_to_fetch.extend(get_dates_for_month(args.year, month))
            target_months.add(month)
        # Only fetch up to today
        today = datetime.now().strftime('%Y-%m-%d')
        dates_to_fetch = [d for d in dates_to_fetch if d <= today]
    elif args.yesterday:
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        dates_to_fetch = [yesterday]
        target_year = int(yesterday.split('-')[0])
        target_months.add(int(yesterday.split('-')[1]))
    else:
        parser.error('Must specify --date, --month, --year, or --yesterday')

    logger.info(f"Will fetch {len(dates_to_fetch)} dates with {args.workers} workers")

    # Fetch each date
    total_games = 0
    for i, date_str in enumerate(dates_to_fetch, 1):
        logger.info(f"[{i}/{len(dates_to_fetch)}] Fetching {date_str}...")

        try:
            data = fetch_date(date_str, max_workers=args.workers)
            if data['gameCount'] > 0:
                save_date_data(date_str, data)
                total_games += data['gameCount']
            else:
                logger.info(f"  No games for {date_str}, skipping save")
        except Exception as e:
            logger.error(f"Error fetching {date_str}: {e}")
            if args.debug:
                raise

        # Small delay between dates to be nice to the API
        if i < len(dates_to_fetch):
            time.sleep(0.5)

    # Update manifest
    if target_year and target_months:
        # Get all months that have data
        year_dir = PBP_DIR / str(target_year)
        if year_dir.exists():
            all_months = sorted([
                int(d.name) for d in year_dir.iterdir()
                if d.is_dir() and d.name.isdigit()
            ])
            if all_months:
                update_manifest(target_year, all_months)

    logger.info(f"Complete! Fetched {total_games} total games across {len(dates_to_fetch)} dates")


if __name__ == '__main__':
    main()
