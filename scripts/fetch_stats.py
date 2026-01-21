#!/usr/bin/env python3
"""
Fetch MiLB stats using the MLB Stats API.

This script fetches stats ONLY for minor league play using leagueListId=milb_all.
Stats include level information (A, A+, AA, AAA) for displaying splits by level.

Data stored:
  - Season totals by level (batting/pitching)
  - Raw game logs with level info (for frontend to calculate splits)
  - Aggregated MiLB totals

Time-based splits (last7, last14, etc.) are calculated in the frontend
so they're always accurate relative to the current date.
"""

import argparse
import json
import logging
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# Level display order (highest to lowest)
LEVEL_ORDER = ['AAA', 'AA', 'A+', 'A', 'CPX', 'MiLB']


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


def get_roster(client: APIClient, team_id: int, season: int) -> Optional[dict]:
    """Fetch team roster (without stats hydration)."""
    return client.get(f'/teams/{team_id}/roster', params={'season': season})


def get_player_milb_stats(client: APIClient, player_id: int, season: int, group: str) -> Optional[dict]:
    """Fetch MiLB-only stats for a player using leagueListId=milb_all."""
    return client.get(f'/people/{player_id}/stats', params={
        'stats': 'season,gameLog',
        'leagueListId': 'milb_all',
        'group': group,
        'hydrate': 'team(league)',
        'season': season,
        'gameType': 'R',
    })


def safe_float(val) -> Optional[float]:
    """Convert string to float, returning None for placeholder values like '-.--'."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


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
            if isinstance(val, str):
                converted = safe_float(val)
                if converted is not None:
                    result[our_key] = converted
            else:
                result[our_key] = val

    # Derived stats
    pa, bb, so = result.get('PA', 0), result.get('BB', 0), result.get('SO', 0)
    h = result.get('H', 0)
    ab = result.get('AB', 0)
    hbp = result.get('HBP', 0)
    doubles = result.get('2B', 0)
    triples = result.get('3B', 0)
    hr = result.get('HR', 0)
    sf = result.get('SF', 0)

    if pa > 0:
        # Store as decimals (0.155 = 15.5%) for consistent formatting
        result['BB%'] = round(bb / pa, 3)
        result['K%'] = round(so / pa, 3)

        # wOBA using linear weights (2024 values approximation)
        singles = h - doubles - triples - hr
        woba_num = 0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * doubles + 1.56 * triples + 1.95 * hr
        result['wOBA'] = round(woba_num / pa, 3)

    avg, slg = result.get('AVG', 0), result.get('SLG', 0)
    if isinstance(avg, (int, float)) and isinstance(slg, (int, float)):
        result['ISO'] = round(slg - avg, 3)

    # BABIP = (H - HR) / (AB - SO - HR + SF)
    babip_denom = ab - so - hr + sf
    if babip_denom > 0:
        result['BABIP'] = round((h - hr) / babip_denom, 3)

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
        'completeGames': 'CG', 'shutouts': 'ShO',
    }

    result = {}
    for api_key, our_key in fields.items():
        val = stat.get(api_key)
        if val is not None:
            if isinstance(val, str):
                converted = safe_float(val)
                if converted is not None:
                    result[our_key] = converted
            else:
                result[our_key] = val

    # Derived stats
    h, bb, so, hbp = result.get('H', 0), result.get('BB', 0), result.get('SO', 0), result.get('HBP', 0)
    hr = result.get('HR', 0)
    ip = result.get('IP', 0)
    bf = h + bb + so + hbp

    if bf > 0:
        # Store as decimals (0.255 = 25.5%) for consistent formatting
        result['K%'] = round(so / bf, 3)
        result['BB%'] = round(bb / bf, 3)

        # BABIP for pitchers = (H - HR) / (BF - SO - HR - BB - HBP)
        babip_denom = bf - so - hr - bb - hbp
        if babip_denom > 0:
            result['BABIP'] = round((h - hr) / babip_denom, 3)

    # FIP = ((13*HR) + (3*(BB+HBP)) - (2*SO)) / IP + constant
    if ip > 0:
        fip_constant = 3.10
        result['FIP'] = round((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + fip_constant, 2)

    return result


def get_level_from_split(split: dict) -> str:
    """Extract level (A, A+, AA, AAA, CPX) from a split's team/league info."""
    # Try sport first (most reliable)
    sport = split.get('sport', {})
    sport_id = sport.get('id')
    if sport_id and sport_id in SPORT_ID_TO_LEVEL:
        return SPORT_ID_TO_LEVEL[sport_id]

    # Try team's sport
    team = split.get('team', {})
    team_sport = team.get('sport', {})
    team_sport_id = team_sport.get('id')
    if team_sport_id and team_sport_id in SPORT_ID_TO_LEVEL:
        return SPORT_ID_TO_LEVEL[team_sport_id]

    # Try league abbreviation
    league = split.get('league', {}) or team.get('league', {})
    league_abbr = league.get('abbreviation', '')
    if league_abbr:
        # Map common league abbreviations to levels
        if 'INT' in league_abbr or 'PCL' in league_abbr:  # International League, Pacific Coast League
            return 'AAA'
        elif league_abbr in ['EL', 'SL', 'TL']:  # Eastern, Southern, Texas League
            return 'AA'
        elif league_abbr in ['SAL', 'MWL', 'CAL', 'FSL', 'CPL']:  # High-A leagues
            return 'A+'
        elif league_abbr in ['CAR', 'SALL']:  # Single-A leagues
            return 'A'

    return 'MiLB'  # Default fallback


def format_game_log(split: dict, stat_type: str) -> dict:
    """Format a single game log entry with level information."""
    entry = {
        'date': split.get('date', ''),
        'level': get_level_from_split(split),
    }

    if 'game' in split and isinstance(split['game'], dict):
        entry['gameId'] = split['game'].get('gamePk')

    if 'opponent' in split:
        opp = split['opponent']
        entry['opponent'] = opp.get('name', '') if isinstance(opp, dict) else str(opp)

    if 'team' in split and isinstance(split['team'], dict):
        entry['team'] = split['team'].get('name', '')

    if 'isHome' in split:
        entry['isHome'] = split['isHome']

    if 'stat' in split:
        formatter = format_batting if stat_type == 'batting' else format_pitching
        entry['stats'] = formatter(split['stat'])

    return entry


def aggregate_batting_stats(stats_list: list[dict]) -> dict:
    """Aggregate multiple batting stat records into totals."""
    counting = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI', 'BB', 'SO',
                'HBP', 'SB', 'CS', 'SF', 'SH', 'GDP']

    totals = defaultdict(int)
    for stats in stats_list:
        for key in counting:
            totals[key] += stats.get(key, 0)

    result = dict(totals)

    # Calculate rate stats
    ab, h = result.get('AB', 0), result.get('H', 0)
    bb, hbp = result.get('BB', 0), result.get('HBP', 0)
    sf = result.get('SF', 0)
    doubles, triples, hr = result.get('2B', 0), result.get('3B', 0), result.get('HR', 0)
    pa, so = result.get('PA', 0), result.get('SO', 0)

    if ab > 0:
        result['AVG'] = round(h / ab, 3)
        tb = h + doubles + 2 * triples + 3 * hr
        result['SLG'] = round(tb / ab, 3)
        result['ISO'] = round(result['SLG'] - result['AVG'], 3)

    obp_denom = ab + bb + hbp + sf
    if obp_denom > 0:
        result['OBP'] = round((h + bb + hbp) / obp_denom, 3)

    if 'OBP' in result and 'SLG' in result:
        result['OPS'] = round(result['OBP'] + result['SLG'], 3)

    if pa > 0:
        # Store as decimals (0.155 = 15.5%) for consistent formatting
        result['BB%'] = round(bb / pa, 3)
        result['K%'] = round(so / pa, 3)

        # wOBA using linear weights (2024 values approximation)
        singles = h - doubles - triples - hr
        woba_num = 0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * doubles + 1.56 * triples + 1.95 * hr
        result['wOBA'] = round(woba_num / pa, 3)

    # BABIP = (H - HR) / (AB - SO - HR + SF)
    babip_denom = ab - so - hr + sf
    if babip_denom > 0:
        result['BABIP'] = round((h - hr) / babip_denom, 3)

    return result


def aggregate_pitching_stats(stats_list: list[dict]) -> dict:
    """Aggregate multiple pitching stat records into totals."""
    counting = ['G', 'GS', 'W', 'L', 'SV', 'HLD', 'BS', 'H', 'R', 'ER',
                'HR', 'BB', 'SO', 'HBP', 'CG', 'ShO']

    totals = defaultdict(int)
    total_ip = 0.0

    for stats in stats_list:
        for key in counting:
            totals[key] += stats.get(key, 0)
        # Handle IP (stored as decimal where .1 = 1/3, .2 = 2/3)
        ip = stats.get('IP', 0)
        if isinstance(ip, str):
            ip = float(ip) if ip else 0.0
        # Convert to outs then back to proper decimal
        whole = int(ip)
        partial = ip - whole
        outs = whole * 3 + int(round(partial * 10))
        total_ip += outs

    result = dict(totals)

    # Convert outs back to IP
    ip_whole = total_ip // 3
    ip_partial = total_ip % 3
    result['IP'] = round(ip_whole + ip_partial / 10, 1)

    # Calculate rate stats
    ip = result['IP']
    er, h, bb, so, hr = result.get('ER', 0), result.get('H', 0), result.get('BB', 0), result.get('SO', 0), result.get('HR', 0)
    hbp = result.get('HBP', 0)

    if ip > 0:
        innings = ip_whole + ip_partial / 3  # Actual innings for calculations
        result['ERA'] = round(9 * er / innings, 2)
        result['WHIP'] = round((bb + h) / innings, 2)
        result['K/9'] = round(9 * so / innings, 1)
        result['BB/9'] = round(9 * bb / innings, 1)
        result['HR/9'] = round(9 * hr / innings, 1)

    if bb > 0:
        result['K/BB'] = round(so / bb, 2)

    bf = h + bb + so + hbp
    if bf > 0:
        # Store as decimals (0.255 = 25.5%) for consistent formatting
        result['K%'] = round(so / bf, 3)
        result['BB%'] = round(bb / bf, 3)

        # BABIP for pitchers = (H - HR) / (BF - SO - HR - BB - HBP)
        babip_denom = bf - so - hr - bb - hbp
        if babip_denom > 0:
            result['BABIP'] = round((h - hr) / babip_denom, 3)

    # FIP = ((13*HR) + (3*(BB+HBP)) - (2*SO)) / IP + constant
    if innings > 0:
        fip_constant = 3.10
        result['FIP'] = round((13 * hr + 3 * (bb + hbp) - 2 * so) / innings + fip_constant, 2)

    return result


def extract_player_stats(player_id: str, hitting_data: Optional[dict], pitching_data: Optional[dict], season: int) -> Optional[dict]:
    """Extract and organize stats from API response, grouped by level."""
    result = {
        'playerId': player_id,
        'season': season,
        'lastUpdated': datetime.now().isoformat(),
    }

    # Track stats by level for aggregation
    batting_by_level = {}
    pitching_by_level = {}
    batting_game_logs = []
    pitching_game_logs = []

    # Process hitting stats
    if hitting_data:
        for stat_group in hitting_data.get('stats', []):
            stat_type = stat_group.get('type', {}).get('displayName', '')
            splits = stat_group.get('splits', [])

            if stat_type == 'season':
                for split in splits:
                    level = get_level_from_split(split)
                    if split.get('stat'):
                        batting_by_level[level] = format_batting(split['stat'])
            elif stat_type == 'gameLog':
                for split in splits:
                    batting_game_logs.append(format_game_log(split, 'batting'))

    # Process pitching stats
    if pitching_data:
        for stat_group in pitching_data.get('stats', []):
            stat_type = stat_group.get('type', {}).get('displayName', '')
            splits = stat_group.get('splits', [])

            if stat_type == 'season':
                for split in splits:
                    level = get_level_from_split(split)
                    if split.get('stat'):
                        pitching_by_level[level] = format_pitching(split['stat'])
            elif stat_type == 'gameLog':
                for split in splits:
                    pitching_game_logs.append(format_game_log(split, 'pitching'))

    # Determine player type
    has_batting = len(batting_by_level) > 0
    has_pitching = len(pitching_by_level) > 0

    if not has_batting and not has_pitching:
        return None

    # Set player type based on which stats dominate
    if has_batting and has_pitching:
        # Two-way player or pitcher who bats - check games played
        batting_games = sum(s.get('G', 0) for s in batting_by_level.values())
        pitching_games = sum(s.get('G', 0) for s in pitching_by_level.values())
        result['type'] = 'pitcher' if pitching_games > batting_games else 'batter'
    elif has_batting:
        result['type'] = 'batter'
    else:
        result['type'] = 'pitcher'

    # Store batting data
    if has_batting:
        result['battingByLevel'] = batting_by_level
        # Create MiLB totals if multiple levels
        if len(batting_by_level) > 1:
            result['batting'] = aggregate_batting_stats(list(batting_by_level.values()))
        else:
            # Single level - use that as the total
            result['batting'] = list(batting_by_level.values())[0]
        result['battingGameLog'] = sorted(batting_game_logs, key=lambda x: x.get('date', ''))

    # Store pitching data
    if has_pitching:
        result['pitchingByLevel'] = pitching_by_level
        # Create MiLB totals if multiple levels
        if len(pitching_by_level) > 1:
            result['pitching'] = aggregate_pitching_stats(list(pitching_by_level.values()))
        else:
            # Single level - use that as the total
            result['pitching'] = list(pitching_by_level.values())[0]
        result['pitchingGameLog'] = sorted(pitching_game_logs, key=lambda x: x.get('date', ''))

    return result


def fetch_player_stats(client: APIClient, player_id: int, season: int) -> Optional[dict]:
    """Fetch MiLB stats for a single player."""
    hitting_data = get_player_milb_stats(client, player_id, season, 'hitting')
    pitching_data = get_player_milb_stats(client, player_id, season, 'pitching')

    return extract_player_stats(str(player_id), hitting_data, pitching_data, season)


def fetch_all_players(season: int) -> set[int]:
    """Get all player IDs from MiLB team rosters."""
    client = APIClient()
    player_ids = set()

    for level, sport_id in MILB_SPORT_IDS.items():
        logger.info(f"Getting {level} rosters (sportId={sport_id})...")
        teams = get_teams(client, sport_id, season)
        logger.info(f"  {len(teams)} teams")

        for team in teams:
            team_id = team.get('id')
            if not team_id:
                continue

            roster_data = get_roster(client, team_id, season)
            if not roster_data:
                continue

            for player in roster_data.get('roster', []):
                person = player.get('person', {})
                player_id = person.get('id')
                if player_id:
                    player_ids.add(player_id)

            time.sleep(0.1)  # Brief pause between roster requests

    logger.info(f"Found {len(player_ids)} unique players")
    return player_ids


def fetch_all_stats(season: int, max_workers: int = 10) -> dict:
    """Fetch MiLB-only stats for all players."""
    # First get all player IDs
    player_ids = fetch_all_players(season)

    all_stats = {}
    failed = 0

    logger.info(f"Fetching stats for {len(player_ids)} players...")

    # Use thread pool for parallel requests
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_player = {}
        for player_id in player_ids:
            client = APIClient()  # New client per thread
            future = executor.submit(fetch_player_stats, client, player_id, season)
            future_to_player[future] = player_id

        # Process results as they complete
        done = 0
        for future in as_completed(future_to_player):
            player_id = future_to_player[future]
            done += 1

            if done % 100 == 0:
                logger.info(f"  Progress: {done}/{len(player_ids)} players...")

            try:
                stats = future.result()
                if stats:
                    all_stats[stats['playerId']] = stats
            except Exception as e:
                logger.warning(f"Failed to fetch player {player_id}: {e}")
                failed += 1

            time.sleep(0.05)  # Small delay between completions

    logger.info(f"Done: {len(all_stats)} players with stats, {failed} failed")
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
    META_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(META_FILE, 'w') as f:
        json.dump({
            'lastUpdated': datetime.now().isoformat(),
            'playerCount': player_count,
        }, f)


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB-only stats using leagueListId filter')
    parser.add_argument('--season', type=int, default=datetime.now().year)
    parser.add_argument('--include-last-season', action='store_true')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Current season
    logger.info(f"Fetching {args.season} MiLB stats...")
    stats = fetch_all_stats(args.season, args.workers)
    if stats:
        save_stats(stats, args.season)
        update_meta(len(stats))

    # Previous season (optional)
    if args.include_last_season:
        last_year = args.season - 1
        logger.info(f"Fetching {last_year} MiLB stats...")
        last_stats = fetch_all_stats(last_year, args.workers)
        if last_stats:
            save_stats(last_stats, last_year)

    logger.info("Complete!")


if __name__ == '__main__':
    main()
