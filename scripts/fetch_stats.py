#!/usr/bin/env python3
"""
scripts/fetch_stats.py
Fetch MiLB stats using the MLB Stats API and save to JSON files.
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from mlbstatsapi import Mlb

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
PLAYERS_FILE = DATA_DIR / 'players.json'

# Rate limiting
REQUEST_DELAY = 1.0  # seconds between requests


def load_players() -> dict:
    """Load the player registry."""
    if PLAYERS_FILE.exists():
        with open(PLAYERS_FILE) as f:
            return json.load(f)
    return {'players': []}


def save_players(data: dict) -> None:
    """Save the player registry."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PLAYERS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def fetch_player_stats(mlb: Mlb, player_id: int, year: int) -> Optional[dict]:
    """Fetch season stats for a player."""
    try:
        # Get season stats for both hitting and pitching
        stats_data = mlb.get_player_stats(
            player_id,
            stats=['season', 'gameLog'],
            groups=['hitting', 'pitching'],
            season=year
        )

        if not stats_data:
            return None

        result = {
            'playerId': str(player_id),
            'season': year,
            'lastUpdated': datetime.now().isoformat(),
        }

        # Process hitting stats
        if 'hitting' in stats_data:
            hitting = stats_data['hitting']

            # Season totals
            if 'season' in hitting and hitting['season']:
                season_stats = hitting['season']
                if hasattr(season_stats, 'splits') and season_stats.splits:
                    split = season_stats.splits[0]
                    if hasattr(split, 'stat'):
                        result['batting'] = extract_batting_stats(split.stat)
                        result['type'] = 'batter'

            # Game logs
            if 'gamelog' in hitting and hitting['gamelog']:
                game_log = hitting['gamelog']
                if hasattr(game_log, 'splits') and game_log.splits:
                    result['battingGameLog'] = [
                        extract_game_log_entry(split, 'batting')
                        for split in game_log.splits
                    ]

        # Process pitching stats
        if 'pitching' in stats_data:
            pitching = stats_data['pitching']

            # Season totals
            if 'season' in pitching and pitching['season']:
                season_stats = pitching['season']
                if hasattr(season_stats, 'splits') and season_stats.splits:
                    split = season_stats.splits[0]
                    if hasattr(split, 'stat'):
                        result['pitching'] = extract_pitching_stats(split.stat)
                        # Only set type to pitcher if no batting stats
                        if 'type' not in result:
                            result['type'] = 'pitcher'

            # Game logs
            if 'gamelog' in pitching and pitching['gamelog']:
                game_log = pitching['gamelog']
                if hasattr(game_log, 'splits') and game_log.splits:
                    result['pitchingGameLog'] = [
                        extract_game_log_entry(split, 'pitching')
                        for split in game_log.splits
                    ]

        # Calculate splits from game logs
        if 'battingGameLog' in result:
            result['battingSplits'] = calculate_batting_splits(result['battingGameLog'])
        if 'pitchingGameLog' in result:
            result['pitchingSplits'] = calculate_pitching_splits(result['pitchingGameLog'])

        return result if 'batting' in result or 'pitching' in result else None

    except Exception as e:
        logger.warning(f"Failed to fetch stats for player {player_id}: {e}")
        return None


def extract_batting_stats(stat) -> dict:
    """Extract batting stats from a stat object."""
    stats = {}

    # Map stat attributes to our format
    stat_mapping = {
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

    for api_name, our_name in stat_mapping.items():
        val = getattr(stat, api_name, None)
        if val is not None:
            # Convert string percentages to floats
            if isinstance(val, str) and val.startswith('.'):
                try:
                    val = float(val)
                except ValueError:
                    pass
            stats[our_name] = val

    # Calculate derived stats if we have the data
    ab = stats.get('AB', 0)
    pa = stats.get('PA', 0)
    bb = stats.get('BB', 0)
    so = stats.get('SO', 0)

    if pa > 0:
        stats['BB%'] = round(100 * bb / pa, 1)
        stats['K%'] = round(100 * so / pa, 1)

    if 'AVG' in stats and 'SLG' in stats:
        avg = float(stats['AVG']) if isinstance(stats['AVG'], str) else stats['AVG']
        slg = float(stats['SLG']) if isinstance(stats['SLG'], str) else stats['SLG']
        stats['ISO'] = round(slg - avg, 3)

    return stats


def extract_pitching_stats(stat) -> dict:
    """Extract pitching stats from a stat object."""
    stats = {}

    stat_mapping = {
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

    for api_name, our_name in stat_mapping.items():
        val = getattr(stat, api_name, None)
        if val is not None:
            stats[our_name] = val

    # Calculate K% and BB% if we have batters faced
    ip = stats.get('IP', 0)
    if isinstance(ip, str):
        try:
            ip = float(ip)
        except ValueError:
            ip = 0

    h = stats.get('H', 0)
    bb = stats.get('BB', 0)
    so = stats.get('SO', 0)
    hbp = stats.get('HBP', 0)

    # Estimate batters faced
    bf = h + bb + so + hbp
    if bf > 0:
        stats['K%'] = round(100 * so / bf, 1)
        stats['BB%'] = round(100 * bb / bf, 1)

    return stats


def extract_game_log_entry(split, stat_type: str) -> dict:
    """Extract a single game log entry."""
    entry = {}

    # Get game info
    if hasattr(split, 'date'):
        entry['date'] = split.date
    if hasattr(split, 'game') and split.game:
        entry['gameId'] = split.game.gamepk if hasattr(split.game, 'gamepk') else None
    if hasattr(split, 'opponent') and split.opponent:
        entry['opponent'] = split.opponent.name if hasattr(split.opponent, 'name') else str(split.opponent)
    if hasattr(split, 'ishome'):
        entry['isHome'] = split.ishome

    # Get stats
    if hasattr(split, 'stat'):
        if stat_type == 'batting':
            entry['stats'] = extract_batting_stats(split.stat)
        else:
            entry['stats'] = extract_pitching_stats(split.stat)

    return entry


def calculate_batting_splits(game_logs: list) -> dict:
    """Calculate time-based splits for batters."""
    splits = {}
    today = datetime.now().date()

    split_ranges = {
        'last7': 7,
        'last14': 14,
        'last30': 30,
    }

    for name, days in split_ranges.items():
        cutoff = today - timedelta(days=days)
        filtered = []

        for game in game_logs:
            game_date_str = game.get('date', '')
            if game_date_str:
                try:
                    game_date = datetime.strptime(game_date_str, '%Y-%m-%d').date()
                    if game_date >= cutoff:
                        filtered.append(game.get('stats', {}))
                except ValueError:
                    continue

        if filtered:
            splits[name] = aggregate_batting_stats(filtered)

    return splits


def calculate_pitching_splits(game_logs: list) -> dict:
    """Calculate time-based splits for pitchers."""
    splits = {}
    today = datetime.now().date()

    split_ranges = {
        'last7': 7,
        'last14': 14,
        'last30': 30,
    }

    for name, days in split_ranges.items():
        cutoff = today - timedelta(days=days)
        filtered = []

        for game in game_logs:
            game_date_str = game.get('date', '')
            if game_date_str:
                try:
                    game_date = datetime.strptime(game_date_str, '%Y-%m-%d').date()
                    if game_date >= cutoff:
                        filtered.append(game.get('stats', {}))
                except ValueError:
                    continue

        if filtered:
            splits[name] = aggregate_pitching_stats(filtered)

    return splits


def aggregate_batting_stats(stats_list: list) -> dict:
    """Aggregate multiple game stats into totals."""
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

    if ab > 0:
        totals['AVG'] = round(h / ab, 3)
        tb = h + totals.get('2B', 0) + 2 * totals.get('3B', 0) + 3 * totals.get('HR', 0)
        totals['SLG'] = round(tb / ab, 3)
        totals['ISO'] = round(totals['SLG'] - totals['AVG'], 3)

    if pa > 0:
        totals['OBP'] = round((h + bb + hbp) / pa, 3)
        totals['BB%'] = round(100 * bb / pa, 1)
        totals['K%'] = round(100 * totals.get('SO', 0) / pa, 1)

    if 'OBP' in totals and 'SLG' in totals:
        totals['OPS'] = round(totals['OBP'] + totals['SLG'], 3)

    return totals


def aggregate_pitching_stats(stats_list: list) -> dict:
    """Aggregate multiple game stats into totals."""
    totals = {}

    count_cols = ['G', 'GS', 'W', 'L', 'SV', 'HLD', 'BS',
                  'H', 'R', 'ER', 'HR', 'BB', 'SO', 'HBP']

    for col in count_cols:
        total = sum(s.get(col, 0) for s in stats_list if isinstance(s.get(col, 0), (int, float)))
        if total > 0:
            totals[col] = int(total)

    # Sum IP (handle fractional innings)
    ip_total = 0
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

    # K% and BB%
    bf = totals.get('H', 0) + totals.get('BB', 0) + totals.get('SO', 0) + totals.get('HBP', 0)
    if bf > 0:
        totals['K%'] = round(100 * totals.get('SO', 0) / bf, 1)
        totals['BB%'] = round(100 * totals.get('BB', 0) / bf, 1)

    return totals


def fetch_all_players(mlb: Mlb, player_ids: list[str], year: int, use_cache: bool = True) -> dict:
    """Fetch stats for all specified players."""
    all_stats = {}

    # Load existing data if using cache
    stats_file = STATS_DIR / f'{year}.json'
    if use_cache and stats_file.exists():
        with open(stats_file) as f:
            all_stats = json.load(f)
        logger.info(f"Loaded {len(all_stats)} players from cache")

    for i, player_id in enumerate(player_ids):
        if use_cache and player_id in all_stats:
            logger.info(f"Skipping {player_id} (cached)")
            continue

        logger.info(f"Fetching stats for player {player_id}...")

        try:
            stats = fetch_player_stats(mlb, int(player_id), year)
            if stats:
                all_stats[player_id] = stats

                # Save game logs separately
                if 'battingGameLog' in stats:
                    save_game_logs(player_id, stats['battingGameLog'], 'batting')
                if 'pitchingGameLog' in stats:
                    save_game_logs(player_id, stats['pitchingGameLog'], 'pitching')

        except Exception as e:
            logger.warning(f"Error fetching player {player_id}: {e}")

        # Rate limiting
        if i < len(player_ids) - 1:
            time.sleep(REQUEST_DELAY)

    # Save aggregated stats
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    with open(stats_file, 'w') as f:
        json.dump(all_stats, f, indent=2, default=str)

    logger.info(f"Saved stats for {len(all_stats)} players")
    return all_stats


def save_game_logs(player_id: str, games: list, stat_type: str) -> None:
    """Save individual player game logs."""
    GAME_LOGS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f'{player_id}_{stat_type}.json'
    with open(GAME_LOGS_DIR / filename, 'w') as f:
        json.dump(games, f, indent=2, default=str)


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB stats')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year (default: current year)')
    parser.add_argument('--players', type=str, default='',
                        help='Comma-separated player IDs (default: all in players.json)')
    parser.add_argument('--no-cache', action='store_true',
                        help='Ignore cached data and refresh all')
    parser.add_argument('--include-last-season', action='store_true',
                        help='Also fetch stats for the previous season')
    args = parser.parse_args()

    # Initialize MLB API client
    mlb = Mlb()

    # Get player list
    if args.players:
        player_ids = [p.strip() for p in args.players.split(',')]
    else:
        registry = load_players()
        player_ids = []
        for p in registry.get('players', []):
            # Support both mlbId and legacy fangraphsId
            player_id = p.get('mlbId') or p.get('fangraphsId')
            if player_id:
                player_ids.append(str(player_id))

    if not player_ids:
        logger.error("No players to fetch. Add players to data/players.json or use --players")
        sys.exit(1)

    logger.info(f"Fetching stats for {len(player_ids)} players (year={args.year})")

    # Fetch stats for current year
    fetch_all_players(mlb, player_ids, args.year, use_cache=not args.no_cache)

    # Optionally fetch last season stats
    if args.include_last_season:
        last_year = args.year - 1
        logger.info(f"Fetching last season stats for {len(player_ids)} players (year={last_year})")
        fetch_all_players(mlb, player_ids, last_year, use_cache=not args.no_cache)

    logger.info("Done!")


if __name__ == '__main__':
    main()
