#!/usr/bin/env python3
"""
scripts/fetch_stats.py

Efficiently fetch MiLB stats using the MLB Stats API with hydration.

Instead of fetching stats for each player individually (~6,000+ API calls),
this script fetches team rosters with hydrated stats (~150 API calls total).

API approach:
  GET /api/v1/teams/{teamId}/roster?hydrate=person(stats(...))

This returns roster members with their stats embedded in the response.
"""

import argparse
import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

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
META_FILE = DATA_DIR / 'meta.json'

# API Configuration
MLB_API_BASE = 'https://statsapi.mlb.com/api/v1'
REQUEST_TIMEOUT = 60
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds between retries

# MiLB sport IDs
MILB_SPORT_IDS = {
    'AAA': 11,
    'AA': 12,
    'A+': 13,
    'A': 14,
    'CPX': 16,
}


class MLBStatsClient:
    """Simple client for MLB Stats API with retry logic."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Accept': 'application/json',
            'User-Agent': 'MiLB-Tracker/1.0'
        })

    def get(self, endpoint: str, params: dict = None) -> Optional[dict]:
        """Make a GET request with retry logic."""
        url = f"{MLB_API_BASE}{endpoint}"

        for attempt in range(MAX_RETRIES):
            try:
                response = self.session.get(url, params=params, timeout=REQUEST_TIMEOUT)
                response.raise_for_status()
                return response.json()
            except requests.exceptions.RequestException as e:
                logger.warning(f"Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                else:
                    logger.error(f"All retries failed for {endpoint}")
                    return None
        return None


def get_teams_for_sport(client: MLBStatsClient, sport_id: int, season: int) -> list[dict]:
    """Get all teams for a given sport/level."""
    data = client.get('/teams', params={
        'sportId': sport_id,
        'season': season,
    })

    if not data:
        return []

    return data.get('teams', [])


def get_team_roster_with_stats(client: MLBStatsClient, team_id: int, season: int) -> Optional[dict]:
    """
    Fetch team roster with hydrated player stats.

    Uses the hydration feature to get season stats and game logs
    for all players in a single API call.
    """
    # Hydration string to get stats embedded with each player
    hydrate = f"person(stats(group=[hitting,pitching],type=[season,gameLog],season={season}))"

    data = client.get(f'/teams/{team_id}/roster', params={
        'season': season,
        'hydrate': hydrate,
    })

    return data


def extract_player_stats(player_data: dict, season: int) -> Optional[dict]:
    """Extract and format stats from a hydrated player object."""
    person = player_data.get('person', {})
    player_id = str(person.get('id', ''))

    if not player_id:
        return None

    result = {
        'playerId': player_id,
        'season': season,
        'lastUpdated': datetime.now().isoformat(),
    }

    # Get stats from the hydrated response
    stats_list = person.get('stats', [])

    for stat_group in stats_list:
        group_name = stat_group.get('group', {}).get('displayName', '')
        stat_type = stat_group.get('type', {}).get('displayName', '')
        splits = stat_group.get('splits', [])

        if not splits:
            continue

        if group_name == 'hitting':
            if stat_type == 'season':
                stat_data = splits[0].get('stat', {})
                if stat_data:
                    result['batting'] = format_batting_stats(stat_data)
                    result['type'] = 'batter'
            elif stat_type == 'gameLog':
                result['battingGameLog'] = [
                    format_game_log(split, 'batting') for split in splits
                ]

        elif group_name == 'pitching':
            if stat_type == 'season':
                stat_data = splits[0].get('stat', {})
                if stat_data:
                    result['pitching'] = format_pitching_stats(stat_data)
                    if 'type' not in result:
                        result['type'] = 'pitcher'
            elif stat_type == 'gameLog':
                result['pitchingGameLog'] = [
                    format_game_log(split, 'pitching') for split in splits
                ]

    # Calculate time-based splits from game logs
    if 'battingGameLog' in result:
        result['battingSplits'] = calculate_splits(result['battingGameLog'], 'batting')
    if 'pitchingGameLog' in result:
        result['pitchingSplits'] = calculate_splits(result['pitchingGameLog'], 'pitching')

    # Only return if we have actual stats
    has_stats = 'batting' in result or 'pitching' in result
    return result if has_stats else None


def format_batting_stats(stat: dict) -> dict:
    """Format batting stats with our field names."""
    mapping = {
        'gamesPlayed': 'G',
        'plateAppearances': 'PA',
        'atBats': 'AB',
        'hits': 'H',
        'doubles': '2B',
        'triples': '3B',
        'homeRuns': 'HR',
        'runs': 'R',
        'rbi': 'RBI',
        'baseOnBalls': 'BB',
        'strikeOuts': 'SO',
        'hitByPitch': 'HBP',
        'stolenBases': 'SB',
        'caughtStealing': 'CS',
        'sacFlies': 'SF',
        'sacBunts': 'SH',
        'groundIntoDoublePlay': 'GDP',
        'avg': 'AVG',
        'obp': 'OBP',
        'slg': 'SLG',
        'ops': 'OPS',
    }

    result = {}
    for api_key, our_key in mapping.items():
        val = stat.get(api_key)
        if val is not None:
            # Convert string rate stats to float
            if isinstance(val, str):
                try:
                    val = float(val)
                except ValueError:
                    pass
            result[our_key] = val

    # Calculate derived stats
    pa = result.get('PA', 0)
    ab = result.get('AB', 0)
    bb = result.get('BB', 0)
    so = result.get('SO', 0)

    if pa > 0:
        result['BB%'] = round(100 * bb / pa, 1)
        result['K%'] = round(100 * so / pa, 1)

    avg = result.get('AVG', 0)
    slg = result.get('SLG', 0)
    if isinstance(avg, (int, float)) and isinstance(slg, (int, float)):
        result['ISO'] = round(slg - avg, 3)

    return result


def format_pitching_stats(stat: dict) -> dict:
    """Format pitching stats with our field names."""
    mapping = {
        'gamesPlayed': 'G',
        'gamesStarted': 'GS',
        'wins': 'W',
        'losses': 'L',
        'saves': 'SV',
        'holds': 'HLD',
        'blownSaves': 'BS',
        'inningsPitched': 'IP',
        'hits': 'H',
        'runs': 'R',
        'earnedRuns': 'ER',
        'homeRuns': 'HR',
        'baseOnBalls': 'BB',
        'strikeOuts': 'SO',
        'hitBatsmen': 'HBP',
        'era': 'ERA',
        'whip': 'WHIP',
        'strikeoutsPer9Inn': 'K/9',
        'walksPer9Inn': 'BB/9',
        'homeRunsPer9': 'HR/9',
        'strikeoutWalkRatio': 'K/BB',
    }

    result = {}
    for api_key, our_key in mapping.items():
        val = stat.get(api_key)
        if val is not None:
            # Convert string stats to appropriate types
            if isinstance(val, str):
                try:
                    val = float(val)
                except ValueError:
                    pass
            result[our_key] = val

    # Calculate K% and BB% from estimated batters faced
    h = result.get('H', 0)
    bb = result.get('BB', 0)
    so = result.get('SO', 0)
    hbp = result.get('HBP', 0)
    bf = h + bb + so + hbp  # Rough batters faced estimate

    if bf > 0:
        result['K%'] = round(100 * so / bf, 1)
        result['BB%'] = round(100 * bb / bf, 1)

    return result


def format_game_log(split: dict, stat_type: str) -> dict:
    """Format a single game log entry."""
    entry = {}

    # Game metadata
    if 'date' in split:
        entry['date'] = split['date']
    if 'game' in split:
        game = split['game']
        if isinstance(game, dict):
            entry['gameId'] = game.get('gamePk')
    if 'opponent' in split:
        opp = split['opponent']
        if isinstance(opp, dict):
            entry['opponent'] = opp.get('name', '')
        else:
            entry['opponent'] = str(opp)
    if 'isHome' in split:
        entry['isHome'] = split['isHome']

    # Stats
    if 'stat' in split:
        if stat_type == 'batting':
            entry['stats'] = format_batting_stats(split['stat'])
        else:
            entry['stats'] = format_pitching_stats(split['stat'])

    return entry


def calculate_splits(game_logs: list, stat_type: str) -> dict:
    """Calculate last7/last14/last30 splits from game logs."""
    splits = {}
    today = datetime.now().date()

    for name, days in [('last7', 7), ('last14', 14), ('last30', 30)]:
        cutoff = today - timedelta(days=days)
        filtered_stats = []

        for game in game_logs:
            date_str = game.get('date', '')
            if not date_str:
                continue
            try:
                game_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                if game_date >= cutoff:
                    if 'stats' in game:
                        filtered_stats.append(game['stats'])
            except ValueError:
                continue

        if filtered_stats:
            if stat_type == 'batting':
                splits[name] = aggregate_batting_stats(filtered_stats)
            else:
                splits[name] = aggregate_pitching_stats(filtered_stats)

    return splits


def aggregate_batting_stats(stats_list: list) -> dict:
    """Aggregate multiple games of batting stats."""
    totals = {}

    count_cols = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI',
                  'BB', 'SO', 'HBP', 'SB', 'CS', 'SF', 'SH', 'GDP']

    for col in count_cols:
        total = sum(s.get(col, 0) for s in stats_list if isinstance(s.get(col, 0), (int, float)))
        if total > 0:
            totals[col] = int(total)

    # Calculate rate stats
    ab = totals.get('AB', 0)
    pa = totals.get('PA', 0)
    h = totals.get('H', 0)
    bb = totals.get('BB', 0)
    hbp = totals.get('HBP', 0)
    so = totals.get('SO', 0)

    if ab > 0:
        totals['AVG'] = round(h / ab, 3)
        tb = h + totals.get('2B', 0) + 2 * totals.get('3B', 0) + 3 * totals.get('HR', 0)
        totals['SLG'] = round(tb / ab, 3)
        totals['ISO'] = round(totals['SLG'] - totals['AVG'], 3)

    if pa > 0:
        totals['OBP'] = round((h + bb + hbp) / pa, 3)
        totals['BB%'] = round(100 * bb / pa, 1)
        totals['K%'] = round(100 * so / pa, 1)

    if 'OBP' in totals and 'SLG' in totals:
        totals['OPS'] = round(totals['OBP'] + totals['SLG'], 3)

    return totals


def aggregate_pitching_stats(stats_list: list) -> dict:
    """Aggregate multiple games of pitching stats."""
    totals = {}

    count_cols = ['G', 'GS', 'W', 'L', 'SV', 'HLD', 'BS',
                  'H', 'R', 'ER', 'HR', 'BB', 'SO', 'HBP']

    for col in count_cols:
        total = sum(s.get(col, 0) for s in stats_list if isinstance(s.get(col, 0), (int, float)))
        if total > 0:
            totals[col] = int(total)

    # Sum IP
    ip_total = 0.0
    for s in stats_list:
        ip = s.get('IP', 0)
        if isinstance(ip, str):
            try:
                ip = float(ip)
            except ValueError:
                ip = 0
        ip_total += ip
    totals['IP'] = round(ip_total, 1)

    # Calculate rate stats
    ip = totals['IP']
    if ip > 0:
        totals['ERA'] = round(9 * totals.get('ER', 0) / ip, 2)
        totals['WHIP'] = round((totals.get('BB', 0) + totals.get('H', 0)) / ip, 2)
        totals['K/9'] = round(9 * totals.get('SO', 0) / ip, 1)
        totals['BB/9'] = round(9 * totals.get('BB', 0) / ip, 1)
        totals['HR/9'] = round(9 * totals.get('HR', 0) / ip, 1)

    bf = totals.get('H', 0) + totals.get('BB', 0) + totals.get('SO', 0) + totals.get('HBP', 0)
    if bf > 0:
        totals['K%'] = round(100 * totals.get('SO', 0) / bf, 1)
        totals['BB%'] = round(100 * totals.get('BB', 0) / bf, 1)

    return totals


def fetch_all_stats(season: int, max_workers: int = 4) -> dict:
    """
    Fetch stats for all MiLB players by iterating through teams.

    This is much more efficient than per-player fetching:
    - ~150 team roster calls vs ~6,000+ individual player calls
    - Each roster call includes stats for ~40 players
    """
    client = MLBStatsClient()
    all_stats = {}
    teams_processed = 0
    players_with_stats = 0

    for level_name, sport_id in MILB_SPORT_IDS.items():
        logger.info(f"Fetching {level_name} teams (sportId={sport_id})...")

        teams = get_teams_for_sport(client, sport_id, season)
        logger.info(f"  Found {len(teams)} teams")

        for team in teams:
            team_id = team.get('id')
            team_name = team.get('name', 'Unknown')

            if not team_id:
                continue

            logger.info(f"  Fetching roster for {team_name}...")
            roster_data = get_team_roster_with_stats(client, team_id, season)

            if not roster_data:
                logger.warning(f"    No roster data for {team_name}")
                continue

            roster = roster_data.get('roster', [])
            team_stats_count = 0

            for player_entry in roster:
                stats = extract_player_stats(player_entry, season)
                if stats:
                    player_id = stats['playerId']
                    all_stats[player_id] = stats
                    team_stats_count += 1
                    players_with_stats += 1

            logger.info(f"    Extracted stats for {team_stats_count} players")
            teams_processed += 1

            # Small delay between teams to be respectful
            time.sleep(0.5)

    logger.info(f"Completed: {teams_processed} teams, {players_with_stats} players with stats")
    return all_stats


def save_stats(stats: dict, season: int) -> None:
    """Save stats to JSON file."""
    STATS_DIR.mkdir(parents=True, exist_ok=True)

    output_file = STATS_DIR / f'{season}.json'
    with open(output_file, 'w') as f:
        json.dump(stats, f, indent=2, default=str)

    logger.info(f"Saved stats to {output_file}")


def save_game_logs(stats: dict) -> None:
    """Save individual game logs to separate files."""
    GAME_LOGS_DIR.mkdir(parents=True, exist_ok=True)

    for player_id, player_stats in stats.items():
        if 'battingGameLog' in player_stats:
            filename = GAME_LOGS_DIR / f'{player_id}_batting.json'
            with open(filename, 'w') as f:
                json.dump(player_stats['battingGameLog'], f, indent=2, default=str)

        if 'pitchingGameLog' in player_stats:
            filename = GAME_LOGS_DIR / f'{player_id}_pitching.json'
            with open(filename, 'w') as f:
                json.dump(player_stats['pitchingGameLog'], f, indent=2, default=str)


def update_meta(player_count: int) -> None:
    """Update the meta.json file."""
    meta = {
        'lastUpdated': datetime.now().isoformat(),
        'playerCount': player_count,
    }

    with open(META_FILE, 'w') as f:
        json.dump(meta, f, indent=2)

    logger.info(f"Updated meta.json: {player_count} players")


def main():
    parser = argparse.ArgumentParser(
        description='Fetch MiLB stats efficiently using team roster hydration'
    )
    parser.add_argument(
        '--season', type=int, default=datetime.now().year,
        help='Season year (default: current year)'
    )
    parser.add_argument(
        '--include-last-season', action='store_true',
        help='Also fetch stats for the previous season'
    )
    parser.add_argument(
        '--debug', action='store_true',
        help='Enable debug logging'
    )

    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Fetch current season
    logger.info(f"Fetching {args.season} season stats...")
    stats = fetch_all_stats(args.season)

    if stats:
        save_stats(stats, args.season)
        save_game_logs(stats)
        update_meta(len(stats))
    else:
        logger.warning(f"No stats found for {args.season}")

    # Optionally fetch previous season
    if args.include_last_season:
        last_year = args.season - 1
        logger.info(f"Fetching {last_year} season stats...")
        last_stats = fetch_all_stats(last_year)

        if last_stats:
            save_stats(last_stats, last_year)

    logger.info("Done!")


if __name__ == '__main__':
    main()
