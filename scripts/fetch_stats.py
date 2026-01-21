#!/usr/bin/env python3
"""
Fetch MiLB stats using the MLB Stats API with team roster hydration.

Instead of fetching stats for each player individually (~6,000+ API calls),
this script fetches team rosters with hydrated stats (~150 API calls total).

Data stored:
  - Season totals (batting/pitching)
  - Raw game logs (for frontend to calculate time-based splits)

Time-based splits (last7, last14, etc.) are calculated in the frontend
so they're always accurate relative to the current date.
"""

import argparse
import json
import logging
import time
from datetime import datetime
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
STATS_DIR = DATA_DIR / 'stats'
META_FILE = DATA_DIR / 'meta.json'

# API
MLB_API_BASE = 'https://statsapi.mlb.com/api/v1'
REQUEST_TIMEOUT = 60
MAX_RETRIES = 3
RETRY_DELAY = 2

# MiLB levels
MILB_SPORT_IDS = {
    'AAA': 11,
    'AA': 12,
    'A+': 13,
    'A': 14,
    'CPX': 16,
}


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
                logger.warning(f"Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
        return None


def get_teams(client: APIClient, sport_id: int, season: int) -> list[dict]:
    """Get all teams for a sport/level."""
    data = client.get('/teams', params={'sportId': sport_id, 'season': season})
    return data.get('teams', []) if data else []


def get_roster_with_stats(client: APIClient, team_id: int, season: int) -> Optional[dict]:
    """Fetch team roster with hydrated player stats."""
    hydrate = f"person(stats(group=[hitting,pitching],type=[season,gameLog],season={season}))"
    return client.get(f'/teams/{team_id}/roster', params={
        'season': season,
        'hydrate': hydrate,
    })


def format_batting(stat: dict) -> dict:
    """Format batting stats."""
    fields = {
        'gamesPlayed': 'G', 'plateAppearances': 'PA', 'atBats': 'AB',
        'hits': 'H', 'doubles': '2B', 'triples': '3B', 'homeRuns': 'HR',
        'runs': 'R', 'rbi': 'RBI', 'baseOnBalls': 'BB', 'strikeOuts': 'SO',
        'hitByPitch': 'HBP', 'stolenBases': 'SB', 'caughtStealing': 'CS',
        'sacFlies': 'SF', 'sacBunts': 'SH', 'groundIntoDoublePlay': 'GDP',
        'avg': 'AVG', 'obp': 'OBP', 'slg': 'SLG', 'ops': 'OPS',
    }

    result = {}
    for api_key, our_key in fields.items():
        val = stat.get(api_key)
        if val is not None:
            result[our_key] = float(val) if isinstance(val, str) else val

    # Derived stats
    pa, bb, so = result.get('PA', 0), result.get('BB', 0), result.get('SO', 0)
    if pa > 0:
        result['BB%'] = round(100 * bb / pa, 1)
        result['K%'] = round(100 * so / pa, 1)

    avg, slg = result.get('AVG', 0), result.get('SLG', 0)
    if isinstance(avg, (int, float)) and isinstance(slg, (int, float)):
        result['ISO'] = round(slg - avg, 3)

    return result


def format_pitching(stat: dict) -> dict:
    """Format pitching stats."""
    fields = {
        'gamesPlayed': 'G', 'gamesStarted': 'GS', 'wins': 'W', 'losses': 'L',
        'saves': 'SV', 'holds': 'HLD', 'blownSaves': 'BS',
        'inningsPitched': 'IP', 'hits': 'H', 'runs': 'R', 'earnedRuns': 'ER',
        'homeRuns': 'HR', 'baseOnBalls': 'BB', 'strikeOuts': 'SO', 'hitBatsmen': 'HBP',
        'era': 'ERA', 'whip': 'WHIP', 'strikeoutsPer9Inn': 'K/9',
        'walksPer9Inn': 'BB/9', 'homeRunsPer9': 'HR/9', 'strikeoutWalkRatio': 'K/BB',
    }

    result = {}
    for api_key, our_key in fields.items():
        val = stat.get(api_key)
        if val is not None:
            result[our_key] = float(val) if isinstance(val, str) else val

    # Derived stats
    h, bb, so, hbp = result.get('H', 0), result.get('BB', 0), result.get('SO', 0), result.get('HBP', 0)
    bf = h + bb + so + hbp
    if bf > 0:
        result['K%'] = round(100 * so / bf, 1)
        result['BB%'] = round(100 * bb / bf, 1)

    return result


def format_game_log(split: dict, stat_type: str) -> dict:
    """Format a single game log entry."""
    entry = {'date': split.get('date', '')}

    if 'game' in split and isinstance(split['game'], dict):
        entry['gameId'] = split['game'].get('gamePk')

    if 'opponent' in split:
        opp = split['opponent']
        entry['opponent'] = opp.get('name', '') if isinstance(opp, dict) else str(opp)

    if 'isHome' in split:
        entry['isHome'] = split['isHome']

    if 'stat' in split:
        entry['stats'] = format_batting(split['stat']) if stat_type == 'batting' else format_pitching(split['stat'])

    return entry


def extract_player_stats(player_data: dict, season: int) -> Optional[dict]:
    """Extract stats from hydrated player object."""
    person = player_data.get('person', {})
    player_id = str(person.get('id', ''))
    if not player_id:
        return None

    result = {
        'playerId': player_id,
        'season': season,
        'lastUpdated': datetime.now().isoformat(),
    }

    for stat_group in person.get('stats', []):
        group = stat_group.get('group', {}).get('displayName', '')
        stat_type = stat_group.get('type', {}).get('displayName', '')
        splits = stat_group.get('splits', [])

        if not splits:
            continue

        if group == 'hitting':
            if stat_type == 'season' and splits[0].get('stat'):
                result['batting'] = format_batting(splits[0]['stat'])
                result['type'] = 'batter'
            elif stat_type == 'gameLog':
                result['battingGameLog'] = [format_game_log(s, 'batting') for s in splits]

        elif group == 'pitching':
            if stat_type == 'season' and splits[0].get('stat'):
                result['pitching'] = format_pitching(splits[0]['stat'])
                if 'type' not in result:
                    result['type'] = 'pitcher'
            elif stat_type == 'gameLog':
                result['pitchingGameLog'] = [format_game_log(s, 'pitching') for s in splits]

    # Only return if we have actual stats
    return result if 'batting' in result or 'pitching' in result else None


def fetch_all_stats(season: int) -> dict:
    """Fetch stats for all MiLB players via team rosters."""
    client = APIClient()
    all_stats = {}
    teams_done = 0

    for level, sport_id in MILB_SPORT_IDS.items():
        logger.info(f"Fetching {level} (sportId={sport_id})...")
        teams = get_teams(client, sport_id, season)
        logger.info(f"  {len(teams)} teams")

        for team in teams:
            team_id = team.get('id')
            if not team_id:
                continue

            team_name = team.get('name', 'Unknown')
            logger.info(f"  {team_name}...")

            roster_data = get_roster_with_stats(client, team_id, season)
            if not roster_data:
                continue

            count = 0
            for player in roster_data.get('roster', []):
                stats = extract_player_stats(player, season)
                if stats:
                    all_stats[stats['playerId']] = stats
                    count += 1

            logger.info(f"    {count} players with stats")
            teams_done += 1
            time.sleep(0.5)  # Be respectful

    logger.info(f"Done: {teams_done} teams, {len(all_stats)} players")
    return all_stats


def save_stats(stats: dict, season: int) -> None:
    """Save stats to JSON."""
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    output = STATS_DIR / f'{season}.json'
    with open(output, 'w') as f:
        json.dump(stats, f, separators=(',', ':'))  # Compact JSON
    logger.info(f"Saved to {output}")


def update_meta(player_count: int) -> None:
    """Update meta.json."""
    with open(META_FILE, 'w') as f:
        json.dump({
            'lastUpdated': datetime.now().isoformat(),
            'playerCount': player_count,
        }, f)


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB stats via team roster hydration')
    parser.add_argument('--season', type=int, default=datetime.now().year)
    parser.add_argument('--include-last-season', action='store_true')
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Current season
    logger.info(f"Fetching {args.season} stats...")
    stats = fetch_all_stats(args.season)
    if stats:
        save_stats(stats, args.season)
        update_meta(len(stats))

    # Previous season (optional)
    if args.include_last_season:
        last_year = args.season - 1
        logger.info(f"Fetching {last_year} stats...")
        last_stats = fetch_all_stats(last_year)
        if last_stats:
            save_stats(last_stats, last_year)

    logger.info("Complete!")


if __name__ == '__main__':
    main()
