#!/usr/bin/env python3
"""
Fetch MiLB stats using the MLB Stats API.

This script fetches stats ONLY for minor league play using leagueListId=milb_all.
Stats include level information (A, A+, AA, AAA) for displaying splits by level.

Data is stored in monthly files to avoid GitHub's file size limits:
  data/stats/{year}/{month}.json  - Player data for that month
  data/stats/{year}/manifest.json - Lists available months

Time-based splits (last7, last14, etc.) are calculated in the frontend
by loading and aggregating the relevant monthly files.
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

        babip_denom = bf - so - hr - bb - hbp
        if babip_denom > 0:
            result['BABIP'] = round((h - hr) / babip_denom, 3)

    if ip > 0:
        fip_constant = 3.10
        result['FIP'] = round((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + fip_constant, 2)

        bip = bf - so - bb - hbp
        if bip > 0:
            expected_hr = bip * 0.035
            result['xFIP'] = round((13 * expected_hr + 3 * (bb + hbp) - 2 * so) / ip + fip_constant, 2)

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

        babip_denom = bf - so - hr - bb - hbp
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


def extract_player_stats_full(player_id: str, hitting_data: Optional[dict], pitching_data: Optional[dict], season: int) -> Optional[dict]:
    """Extract full player stats including all game logs."""
    result = {
        'playerId': player_id,
        'season': season,
        'lastUpdated': datetime.now().isoformat(),
    }

    batting_by_level = {}
    pitching_by_level = {}
    batting_game_logs = []
    pitching_game_logs = []

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

    has_batting = len(batting_by_level) > 0 or len(batting_game_logs) > 0
    has_pitching = len(pitching_by_level) > 0 or len(pitching_game_logs) > 0

    if not has_batting and not has_pitching:
        return None

    if has_batting and has_pitching:
        batting_games = sum(s.get('G', 0) for s in batting_by_level.values())
        pitching_games = sum(s.get('G', 0) for s in pitching_by_level.values())
        result['type'] = 'pitcher' if pitching_games > batting_games else 'batter'
    elif has_batting:
        result['type'] = 'batter'
    else:
        result['type'] = 'pitcher'

    if has_batting:
        result['battingByLevel'] = batting_by_level
        if 'MiLB' in batting_by_level:
            result['batting'] = batting_by_level['MiLB']
        elif len(batting_by_level) > 1:
            result['batting'] = aggregate_batting_stats(list(batting_by_level.values()))
        elif batting_by_level:
            result['batting'] = list(batting_by_level.values())[0]
        result['battingGameLog'] = sorted(batting_game_logs, key=lambda x: x.get('date', ''))

    if has_pitching:
        result['pitchingByLevel'] = pitching_by_level
        if 'MiLB' in pitching_by_level:
            result['pitching'] = pitching_by_level['MiLB']
        elif len(pitching_by_level) > 1:
            result['pitching'] = aggregate_pitching_stats(list(pitching_by_level.values()))
        elif pitching_by_level:
            result['pitching'] = list(pitching_by_level.values())[0]
        result['pitchingGameLog'] = sorted(pitching_game_logs, key=lambda x: x.get('date', ''))

    return result


def filter_player_stats_by_month(player_stats: dict, year: int, month: int) -> Optional[dict]:
    """Filter a player's stats to only include games from a specific month."""
    month_prefix = f"{year}-{month:02d}"

    result = {
        'playerId': player_stats['playerId'],
        'season': year,
        'type': player_stats.get('type', 'batter'),
    }

    # Filter batting game logs
    if 'battingGameLog' in player_stats:
        month_logs = [
            log for log in player_stats['battingGameLog']
            if log.get('date', '').startswith(month_prefix)
        ]
        if month_logs:
            result['battingGameLog'] = month_logs
            # Aggregate stats from this month's games
            month_stats = [log['stats'] for log in month_logs if 'stats' in log]
            if month_stats:
                result['batting'] = aggregate_batting_stats(month_stats)
                result['battingByLevel'] = aggregate_game_logs_by_level(month_logs, 'batting')

    # Filter pitching game logs
    if 'pitchingGameLog' in player_stats:
        month_logs = [
            log for log in player_stats['pitchingGameLog']
            if log.get('date', '').startswith(month_prefix)
        ]
        if month_logs:
            result['pitchingGameLog'] = month_logs
            month_stats = [log['stats'] for log in month_logs if 'stats' in log]
            if month_stats:
                result['pitching'] = aggregate_pitching_stats(month_stats)
                result['pitchingByLevel'] = aggregate_game_logs_by_level(month_logs, 'pitching')

    # Only return if player has data for this month
    if 'batting' in result or 'pitching' in result:
        return result
    return None


def fetch_player_stats(client: APIClient, player_id: int, season: int) -> Optional[dict]:
    """Fetch MiLB stats for a single player."""
    hitting_data = get_player_milb_stats(client, player_id, season, 'hitting')
    pitching_data = get_player_milb_stats(client, player_id, season, 'pitching')

    return extract_player_stats_full(str(player_id), hitting_data, pitching_data, season)


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

            time.sleep(0.1)

    logger.info(f"Found {len(player_ids)} unique players")
    return player_ids


def fetch_all_stats(season: int, max_workers: int = 10) -> dict:
    """Fetch MiLB-only stats for all players."""
    player_ids = fetch_all_players(season)

    all_stats = {}
    failed = 0

    logger.info(f"Fetching stats for {len(player_ids)} players...")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_player = {}
        for player_id in player_ids:
            client = APIClient()
            future = executor.submit(fetch_player_stats, client, player_id, season)
            future_to_player[future] = player_id

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

            time.sleep(0.05)

    logger.info(f"Done: {len(all_stats)} players with stats, {failed} failed")
    return all_stats


def save_monthly_stats(all_stats: dict, season: int, month: int) -> int:
    """Filter and save stats for a specific month. Returns player count."""
    year_dir = STATS_DIR / str(season)
    year_dir.mkdir(parents=True, exist_ok=True)

    month_players = {}
    for player_id, player_stats in all_stats.items():
        month_stats = filter_player_stats_by_month(player_stats, season, month)
        if month_stats:
            month_players[player_id] = month_stats

    if not month_players:
        logger.info(f"  No data for month {month}")
        return 0

    output = {
        'year': season,
        'month': month,
        'updated': datetime.now().isoformat(),
        'players': month_players,
    }

    month_file = year_dir / f'{month:02d}.json'
    with open(month_file, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    logger.info(f"  Saved {len(month_players)} players to {month_file}")
    return len(month_players)


def update_manifest(season: int, months: list[int]) -> None:
    """Update the year's manifest file."""
    year_dir = STATS_DIR / str(season)
    year_dir.mkdir(parents=True, exist_ok=True)

    manifest_file = year_dir / 'manifest.json'

    manifest = {
        'year': season,
        'updated': datetime.now().isoformat(),
        'months': sorted(months),
    }

    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    logger.info(f"Updated manifest: {manifest_file}")


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
    parser.add_argument('--month', type=int, default=None,
                        help='Specific month to save (default: current month)')
    parser.add_argument('--all-months', action='store_true',
                        help='Save all season months (April-September)')
    parser.add_argument('--include-last-season', action='store_true')
    parser.add_argument('--workers', type=int, default=10, help='Number of parallel workers')
    parser.add_argument('--debug', action='store_true')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Determine which months to save
    if args.month:
        months_to_save = [args.month]
    elif args.all_months:
        months_to_save = SEASON_MONTHS
    else:
        # Default to current month
        current_month = datetime.now().month
        if current_month in SEASON_MONTHS:
            months_to_save = [current_month]
        else:
            logger.info(f"Month {current_month} is outside season (April-September)")
            months_to_save = []

    # Fetch current season
    logger.info(f"Fetching {args.season} MiLB stats...")
    all_stats = fetch_all_stats(args.season, args.workers)

    if all_stats:
        total_players = 0
        months_saved = []

        for month in months_to_save:
            month_name = datetime(args.season, month, 1).strftime('%B')
            logger.info(f"Saving {month_name} {args.season}...")
            count = save_monthly_stats(all_stats, args.season, month)
            if count > 0:
                months_saved.append(month)
                total_players = max(total_players, count)

        # Check for existing months in directory
        year_dir = STATS_DIR / str(args.season)
        if year_dir.exists():
            existing_months = [
                int(f.stem) for f in year_dir.glob('*.json')
                if f.stem.isdigit()
            ]
            all_months = sorted(set(existing_months + months_saved))
        else:
            all_months = months_saved

        if all_months:
            update_manifest(args.season, all_months)
            update_meta(len(all_stats))

    # Previous season (optional)
    if args.include_last_season:
        last_year = args.season - 1
        logger.info(f"Fetching {last_year} MiLB stats...")
        last_stats = fetch_all_stats(last_year, args.workers)
        if last_stats:
            for month in SEASON_MONTHS:
                save_monthly_stats(last_stats, last_year, month)

            year_dir = STATS_DIR / str(last_year)
            if year_dir.exists():
                existing_months = [
                    int(f.stem) for f in year_dir.glob('*.json')
                    if f.stem.isdigit()
                ]
                update_manifest(last_year, existing_months)

    logger.info("Complete!")


if __name__ == '__main__':
    main()
