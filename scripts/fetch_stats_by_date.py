#!/usr/bin/env python3
"""
Fetch MiLB stats for specific dates, months, or years.

This script is designed for:
1. Nightly updates: Fetch previous day's games and update monthly files
2. Backfilling: Fetch a specific date, month, or full year of data

Data is stored in monthly files:
  data/stats/{year}/{month}.json - Player data for that month
  data/stats/{year}/manifest.json - Lists available months

Usage:
  # Fetch yesterday's games (for nightly cron)
  python fetch_stats_by_date.py --yesterday

  # Fetch a specific date
  python fetch_stats_by_date.py --date 2025-06-15

  # Fetch an entire month
  python fetch_stats_by_date.py --month 2025-06

  # Fetch a full year (all season months April-September)
  python fetch_stats_by_date.py --year 2025
"""

import argparse
import json
import logging
import time
from calendar import monthrange
from collections import defaultdict
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
                logger.warning(f"Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
        return None


def get_games_for_date(client: APIClient, date: str) -> list[dict]:
    """Get all MiLB games scheduled for a specific date."""
    games = []
    sport_ids = ','.join(str(sid) for sid in MILB_SPORT_IDS.values())

    data = client.get('/schedule', params={
        'sportId': sport_ids,
        'date': date,
        'gameType': 'R',
        'hydrate': 'team,linescore'
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


def get_players_from_games(client: APIClient, games: list[dict]) -> set[int]:
    """Extract player IDs from boxscore data of completed games."""
    player_ids = set()

    for game in games:
        game_pk = game.get('gamePk')
        if not game_pk:
            continue

        # Get boxscore for the game
        boxscore = client.get(f'/game/{game_pk}/boxscore')
        if not boxscore:
            continue

        # Extract players from both teams
        for team_type in ['away', 'home']:
            team_data = boxscore.get('teams', {}).get(team_type, {})
            players = team_data.get('players', {})

            for player_key, player_info in players.items():
                player_id = player_info.get('person', {}).get('id')
                if player_id:
                    player_ids.add(player_id)

        time.sleep(0.1)  # Rate limiting

    return player_ids


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
    """Convert string to float, returning None for placeholder values."""
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
        result['BB%'] = round(bb / pa, 3)
        result['K%'] = round(so / pa, 3)

        singles = h - doubles - triples - hr
        woba_num = 0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * doubles + 1.56 * triples + 1.95 * hr
        result['wOBA'] = round(woba_num / pa, 3)

    avg, slg = result.get('AVG', 0), result.get('SLG', 0)
    if isinstance(avg, (int, float)) and isinstance(slg, (int, float)):
        result['ISO'] = round(slg - avg, 3)

    babip_denom = ab - so - hr + sf
    if babip_denom > 0:
        result['BABIP'] = round((h - hr) / babip_denom, 3)

    if 'wOBA' in result:
        lg_woba = 0.315
        woba_scale = 1.15
        lg_r_per_pa = 0.11
        wrc_plus = ((result['wOBA'] - lg_woba) / woba_scale + lg_r_per_pa) / lg_r_per_pa * 100
        result['wRC+'] = round(wrc_plus)

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

    h, bb, so, hbp = result.get('H', 0), result.get('BB', 0), result.get('SO', 0), result.get('HBP', 0)
    hr = result.get('HR', 0)
    ip = result.get('IP', 0)
    bf = h + bb + so + hbp

    if bf > 0:
        result['K%'] = round(so / bf, 3)
        result['BB%'] = round(bb / bf, 3)
        # K%-BB% (strikeout rate minus walk rate)
        result['K%-BB%'] = round((so - bb) / bf, 3)

    # Convert IP from baseball notation (5.1 = 5 1/3) to true innings for calculations
    ip_whole = int(ip)
    ip_partial = round((ip - ip_whole) * 10)
    true_ip = ip_whole + ip_partial / 3

    # BABIP for pitchers: (H - HR) / (BIP)
    # BIP = H - HR + outs on balls in play, where outs on balls in play ≈ 3*IP - SO
    if true_ip > 0:
        babip_denom = 3 * true_ip + h - so - hr
        if babip_denom > 0:
            result['BABIP'] = round((h - hr) / babip_denom, 3)

    if true_ip > 0:
        fip_constant = 3.10
        result['FIP'] = round((13 * hr + 3 * (bb + hbp) - 2 * so) / true_ip + fip_constant, 2)

        bip = bf - so - bb - hbp
        if bip > 0:
            expected_hr = bip * 0.035
            result['xFIP'] = round((13 * expected_hr + 3 * (bb + hbp) - 2 * so) / true_ip + fip_constant, 2)

    return result


def get_level_from_split(split: dict) -> str:
    """Extract level (A, A+, AA, AAA, CPX) from a split's team/league info."""
    sport = split.get('sport', {})
    sport_id = sport.get('id')
    if sport_id and sport_id in SPORT_ID_TO_LEVEL:
        return SPORT_ID_TO_LEVEL[sport_id]

    team = split.get('team', {})
    team_sport = team.get('sport', {})
    team_sport_id = team_sport.get('id')
    if team_sport_id and team_sport_id in SPORT_ID_TO_LEVEL:
        return SPORT_ID_TO_LEVEL[team_sport_id]

    league = split.get('league', {}) or team.get('league', {})
    league_abbr = league.get('abbreviation', '')
    if league_abbr:
        if 'INT' in league_abbr or 'PCL' in league_abbr:
            return 'AAA'
        elif league_abbr in ['EL', 'SL', 'TL']:
            return 'AA'
        elif league_abbr in ['SAL', 'MWL', 'CAL', 'FSL', 'CPL']:
            return 'A+'
        elif league_abbr in ['CAR', 'SALL']:
            return 'A'

    return 'MiLB'


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
        result['BB%'] = round(bb / pa, 3)
        result['K%'] = round(so / pa, 3)

        singles = h - doubles - triples - hr
        woba_num = 0.69 * bb + 0.72 * hbp + 0.88 * singles + 1.24 * doubles + 1.56 * triples + 1.95 * hr
        result['wOBA'] = round(woba_num / pa, 3)

    babip_denom = ab - so - hr + sf
    if babip_denom > 0:
        result['BABIP'] = round((h - hr) / babip_denom, 3)

    if 'wOBA' in result:
        lg_woba = 0.315
        woba_scale = 1.15
        lg_r_per_pa = 0.11
        wrc_plus = ((result['wOBA'] - lg_woba) / woba_scale + lg_r_per_pa) / lg_r_per_pa * 100
        result['wRC+'] = round(wrc_plus)

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
        ip = stats.get('IP', 0)
        if isinstance(ip, str):
            ip = float(ip) if ip else 0.0
        whole = int(ip)
        partial = ip - whole
        outs = whole * 3 + int(round(partial * 10))
        total_ip += outs

    result = dict(totals)

    ip_whole = total_ip // 3
    ip_partial = total_ip % 3
    result['IP'] = round(ip_whole + ip_partial / 10, 1)

    ip = result['IP']
    er, h, bb, so, hr = result.get('ER', 0), result.get('H', 0), result.get('BB', 0), result.get('SO', 0), result.get('HR', 0)
    hbp = result.get('HBP', 0)

    if ip > 0:
        innings = ip_whole + ip_partial / 3
        result['ERA'] = round(9 * er / innings, 2)
        result['WHIP'] = round((bb + h) / innings, 2)
        result['K/9'] = round(9 * so / innings, 1)
        result['BB/9'] = round(9 * bb / innings, 1)
        result['HR/9'] = round(9 * hr / innings, 1)

    if bb > 0:
        result['K/BB'] = round(so / bb, 2)

    bf = h + bb + so + hbp
    if bf > 0:
        result['K%'] = round(so / bf, 3)
        result['BB%'] = round(bb / bf, 3)
        # K%-BB% (strikeout rate minus walk rate)
        result['K%-BB%'] = round((so - bb) / bf, 3)

    # BABIP for pitchers: (H - HR) / (BIP)
    # BIP = H - HR + outs on balls in play, where outs on balls in play ≈ 3*IP - SO
    if ip > 0:
        innings = ip_whole + ip_partial / 3
        babip_denom = 3 * innings + h - so - hr
        if babip_denom > 0:
            result['BABIP'] = round((h - hr) / babip_denom, 3)

    if ip > 0:
        innings = ip_whole + ip_partial / 3
        fip_constant = 3.10
        result['FIP'] = round((13 * hr + 3 * (bb + hbp) - 2 * so) / innings + fip_constant, 2)

        bip = bf - so - bb - hbp
        if bip > 0:
            expected_hr = bip * 0.035
            result['xFIP'] = round((13 * expected_hr + 3 * (bb + hbp) - 2 * so) / innings + fip_constant, 2)

    return result


def aggregate_game_logs_by_level(game_logs: list[dict], stat_type: str) -> dict:
    """Aggregate game logs into stats by level."""
    by_level = defaultdict(list)

    for log in game_logs:
        level = log.get('level', 'MiLB')
        if 'stats' in log:
            by_level[level].append(log['stats'])

    aggregator = aggregate_batting_stats if stat_type == 'batting' else aggregate_pitching_stats
    return {level: aggregator(stats) for level, stats in by_level.items() if stats}


def fetch_player_stats(client: APIClient, player_id: int, season: int) -> Optional[dict]:
    """Fetch MiLB stats for a single player and format for storage."""
    hitting_data = get_player_milb_stats(client, player_id, season, 'hitting')
    pitching_data = get_player_milb_stats(client, player_id, season, 'pitching')

    result = {
        'playerId': str(player_id),
        'season': season,
        'lastUpdated': datetime.now().isoformat(),
    }

    batting_game_logs = []
    pitching_game_logs = []

    if hitting_data:
        for stat_group in hitting_data.get('stats', []):
            stat_type = stat_group.get('type', {}).get('displayName', '')
            splits = stat_group.get('splits', [])
            if stat_type == 'gameLog':
                for split in splits:
                    batting_game_logs.append(format_game_log(split, 'batting'))

    if pitching_data:
        for stat_group in pitching_data.get('stats', []):
            stat_type = stat_group.get('type', {}).get('displayName', '')
            splits = stat_group.get('splits', [])
            if stat_type == 'gameLog':
                for split in splits:
                    pitching_game_logs.append(format_game_log(split, 'pitching'))

    has_batting = len(batting_game_logs) > 0
    has_pitching = len(pitching_game_logs) > 0

    if not has_batting and not has_pitching:
        return None

    if has_batting and has_pitching:
        result['type'] = 'pitcher' if len(pitching_game_logs) > len(batting_game_logs) else 'batter'
    elif has_batting:
        result['type'] = 'batter'
    else:
        result['type'] = 'pitcher'

    if has_batting:
        result['battingGameLog'] = sorted(batting_game_logs, key=lambda x: x.get('date', ''))

    if has_pitching:
        result['pitchingGameLog'] = sorted(pitching_game_logs, key=lambda x: x.get('date', ''))

    return result


def filter_logs_for_month(game_logs: list[dict], year: int, month: int) -> list[dict]:
    """Filter game logs to only include games from a specific month."""
    month_prefix = f"{year}-{month:02d}"
    return [log for log in game_logs if log.get('date', '').startswith(month_prefix)]


def build_player_month_stats(player_stats: dict, year: int, month: int) -> Optional[dict]:
    """Build player stats entry for a specific month from full game logs."""
    result = {
        'playerId': player_stats['playerId'],
        'season': year,
        'type': player_stats.get('type', 'batter'),
    }

    # Filter batting game logs
    if 'battingGameLog' in player_stats:
        month_logs = filter_logs_for_month(player_stats['battingGameLog'], year, month)
        if month_logs:
            result['battingGameLog'] = month_logs
            month_stats = [log['stats'] for log in month_logs if 'stats' in log]
            if month_stats:
                result['batting'] = aggregate_batting_stats(month_stats)
                result['battingByLevel'] = aggregate_game_logs_by_level(month_logs, 'batting')

    # Filter pitching game logs
    if 'pitchingGameLog' in player_stats:
        month_logs = filter_logs_for_month(player_stats['pitchingGameLog'], year, month)
        if month_logs:
            result['pitchingGameLog'] = month_logs
            month_stats = [log['stats'] for log in month_logs if 'stats' in log]
            if month_stats:
                result['pitching'] = aggregate_pitching_stats(month_stats)
                result['pitchingByLevel'] = aggregate_game_logs_by_level(month_logs, 'pitching')

    if 'batting' in result or 'pitching' in result:
        return result
    return None


def load_monthly_file(year: int, month: int) -> dict:
    """Load existing monthly stats file or return empty structure."""
    month_file = STATS_DIR / str(year) / f'{month:02d}.json'
    if month_file.exists():
        with open(month_file) as f:
            return json.load(f)
    return {
        'year': year,
        'month': month,
        'updated': datetime.now().isoformat(),
        'players': {},
    }


def save_monthly_file(data: dict, year: int, month: int) -> None:
    """Save monthly stats file."""
    year_dir = STATS_DIR / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)

    data['updated'] = datetime.now().isoformat()

    month_file = year_dir / f'{month:02d}.json'
    with open(month_file, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

    logger.info(f"Saved {len(data.get('players', {}))} players to {month_file}")


def update_manifest(year: int) -> None:
    """Update the year's manifest file based on existing month files."""
    year_dir = STATS_DIR / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)

    # Find all existing month files
    existing_months = []
    for f in year_dir.glob('*.json'):
        if f.stem.isdigit():
            existing_months.append(int(f.stem))

    manifest = {
        'year': year,
        'updated': datetime.now().isoformat(),
        'months': sorted(existing_months),
    }

    manifest_file = year_dir / 'manifest.json'
    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    logger.info(f"Updated manifest: {manifest_file}")


def update_meta() -> None:
    """Update meta.json with current timestamp."""
    # Count total unique players across all files
    total_players = set()
    for year_dir in STATS_DIR.iterdir():
        if year_dir.is_dir() and year_dir.name.isdigit():
            for month_file in year_dir.glob('[0-9][0-9].json'):
                try:
                    with open(month_file) as f:
                        data = json.load(f)
                        total_players.update(data.get('players', {}).keys())
                except (json.JSONDecodeError, IOError):
                    pass

    META_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(META_FILE, 'w') as f:
        json.dump({
            'lastUpdated': datetime.now().isoformat(),
            'playerCount': len(total_players),
        }, f)


def fetch_and_update_for_date(date_str: str, max_workers: int = 100) -> dict:
    """Fetch stats for all players who played on a specific date."""
    client = APIClient()

    logger.info(f"Fetching games for {date_str}...")
    games = get_games_for_date(client, date_str)
    logger.info(f"Found {len(games)} completed games")

    if not games:
        return {}

    logger.info("Extracting player IDs from boxscores...")
    player_ids = get_players_from_games(client, games)
    logger.info(f"Found {len(player_ids)} unique players")

    if not player_ids:
        return {}

    # Parse the date to get year
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    year = date_obj.year

    # Fetch stats for all players
    all_stats = {}
    failed = 0

    logger.info(f"Fetching stats for {len(player_ids)} players...")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_player = {}
        for player_id in player_ids:
            api_client = APIClient()
            future = executor.submit(fetch_player_stats, api_client, player_id, year)
            future_to_player[future] = player_id

        done = 0
        for future in as_completed(future_to_player):
            player_id = future_to_player[future]
            done += 1

            if done % 50 == 0:
                logger.info(f"  Progress: {done}/{len(player_ids)} players...")

            try:
                stats = future.result()
                if stats:
                    all_stats[stats['playerId']] = stats
            except Exception as e:
                logger.warning(f"Failed to fetch player {player_id}: {e}")
                failed += 1

            time.sleep(0.05)

    logger.info(f"Fetched stats for {len(all_stats)} players ({failed} failed)")
    return all_stats


def update_monthly_stats(all_stats: dict, year: int, month: int) -> int:
    """Update monthly file with new player stats. Returns count of players updated."""
    monthly_data = load_monthly_file(year, month)
    players = monthly_data.get('players', {})

    updated_count = 0
    for player_id, player_stats in all_stats.items():
        month_stats = build_player_month_stats(player_stats, year, month)
        if month_stats:
            players[player_id] = month_stats
            updated_count += 1

    monthly_data['players'] = players
    save_monthly_file(monthly_data, year, month)

    return updated_count


def fetch_date(date_str: str, max_workers: int = 100) -> None:
    """Fetch and save stats for a specific date."""
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    year = date_obj.year
    month = date_obj.month

    all_stats = fetch_and_update_for_date(date_str, max_workers)
    if all_stats:
        updated = update_monthly_stats(all_stats, year, month)
        logger.info(f"Updated {updated} players for {date_str}")
        update_manifest(year)
        update_meta()


def fetch_month(year: int, month: int, max_workers: int = 100) -> None:
    """Fetch stats for an entire month."""
    logger.info(f"Fetching all games for {year}-{month:02d}...")

    # Get the number of days in the month
    _, num_days = monthrange(year, month)

    # Collect all player stats for the month
    all_player_stats = {}

    for day in range(1, num_days + 1):
        date_str = f"{year}-{month:02d}-{day:02d}"
        logger.info(f"Processing {date_str}...")

        day_stats = fetch_and_update_for_date(date_str, max_workers)

        # Merge player stats
        for player_id, stats in day_stats.items():
            if player_id in all_player_stats:
                # Merge game logs
                existing = all_player_stats[player_id]
                if 'battingGameLog' in stats:
                    existing_logs = existing.get('battingGameLog', [])
                    new_logs = stats['battingGameLog']
                    # Combine and dedupe by date+gameId
                    all_logs = existing_logs + new_logs
                    seen = set()
                    deduped = []
                    for log in all_logs:
                        key = (log.get('date'), log.get('gameId'))
                        if key not in seen:
                            seen.add(key)
                            deduped.append(log)
                    existing['battingGameLog'] = sorted(deduped, key=lambda x: x.get('date', ''))
                if 'pitchingGameLog' in stats:
                    existing_logs = existing.get('pitchingGameLog', [])
                    new_logs = stats['pitchingGameLog']
                    all_logs = existing_logs + new_logs
                    seen = set()
                    deduped = []
                    for log in all_logs:
                        key = (log.get('date'), log.get('gameId'))
                        if key not in seen:
                            seen.add(key)
                            deduped.append(log)
                    existing['pitchingGameLog'] = sorted(deduped, key=lambda x: x.get('date', ''))
            else:
                all_player_stats[player_id] = stats

    # Now build the monthly file
    if all_player_stats:
        updated = update_monthly_stats(all_player_stats, year, month)
        logger.info(f"Saved {updated} players for {year}-{month:02d}")
        update_manifest(year)
        update_meta()


def fetch_year(year: int, max_workers: int = 100) -> None:
    """Fetch stats for all season months of a year."""
    logger.info(f"Fetching all season months for {year}...")

    for month in SEASON_MONTHS:
        month_name = datetime(year, month, 1).strftime('%B')
        logger.info(f"\n{'='*50}")
        logger.info(f"Processing {month_name} {year}...")
        logger.info(f"{'='*50}")
        fetch_month(year, month, max_workers)

    logger.info(f"\nCompleted fetching all data for {year}")


def main():
    parser = argparse.ArgumentParser(
        description='Fetch MiLB stats for specific dates, months, or years',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --yesterday           Fetch yesterday's games
  %(prog)s --date 2025-06-15     Fetch specific date
  %(prog)s --month 2025-06       Fetch entire month
  %(prog)s --year 2025           Fetch full season (April-September)
        """
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--yesterday', action='store_true',
                       help="Fetch yesterday's games")
    group.add_argument('--date', type=str,
                       help='Fetch specific date (YYYY-MM-DD)')
    group.add_argument('--month', type=str,
                       help='Fetch entire month (YYYY-MM)')
    group.add_argument('--year', type=int,
                       help='Fetch full season for year (April-September)')

    parser.add_argument('--workers', type=int, default=100,
                        help='Number of parallel workers (default: 100)')
    parser.add_argument('--debug', action='store_true',
                        help='Enable debug logging')

    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.yesterday:
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        logger.info(f"Fetching yesterday's games ({yesterday})...")
        fetch_date(yesterday, args.workers)

    elif args.date:
        # Validate date format
        try:
            datetime.strptime(args.date, '%Y-%m-%d')
        except ValueError:
            parser.error(f"Invalid date format: {args.date}. Use YYYY-MM-DD")
        fetch_date(args.date, args.workers)

    elif args.month:
        # Parse month (YYYY-MM)
        try:
            date_obj = datetime.strptime(args.month + '-01', '%Y-%m-%d')
            fetch_month(date_obj.year, date_obj.month, args.workers)
        except ValueError:
            parser.error(f"Invalid month format: {args.month}. Use YYYY-MM")

    elif args.year:
        fetch_year(args.year, args.workers)

    logger.info("Complete!")


if __name__ == '__main__':
    main()
