#!/usr/bin/env python3
"""
scripts/fetch_stats.py
Fetch MiLB stats using pybaseball and save to JSON files.
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import pybaseball as pyb

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
REQUEST_DELAY = 2.0  # seconds between requests


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


def fetch_batter_stats(player_id: str, year: int) -> Optional[dict]:
    """Fetch batting game logs for a player."""
    try:
        df = pyb.milb_batter_game_logs_fg(player_id, year)
        if df is None or df.empty:
            return None

        # Convert to records
        games = df.to_dict(orient='records')

        # Calculate season totals
        season = calculate_batting_season_totals(df)

        return {
            'type': 'batter',
            'games': games,
            'season': season,
            'splits': calculate_batting_splits(df)
        }
    except Exception as e:
        logger.warning(f"Failed to fetch batting stats for {player_id}: {e}")
        return None


def fetch_pitcher_stats(player_id: str, year: int) -> Optional[dict]:
    """Fetch pitching game logs for a player."""
    try:
        df = pyb.milb_pitcher_game_logs_fg(player_id, year)
        if df is None or df.empty:
            return None

        games = df.to_dict(orient='records')
        season = calculate_pitching_season_totals(df)

        return {
            'type': 'pitcher',
            'games': games,
            'season': season,
            'splits': calculate_pitching_splits(df)
        }
    except Exception as e:
        logger.warning(f"Failed to fetch pitching stats for {player_id}: {e}")
        return None


def calculate_batting_season_totals(df: pd.DataFrame) -> dict:
    """Calculate season batting totals from game logs."""
    totals = {}

    # Counting stats - sum
    count_cols = ['G', 'PA', 'AB', 'H', '2B', '3B', 'HR', 'R', 'RBI',
                  'BB', 'SO', 'HBP', 'SB', 'CS', 'SF', 'SH', 'GDP']
    for col in count_cols:
        if col in df.columns:
            totals[col] = int(df[col].sum())

    # Calculate rate stats
    if totals.get('AB', 0) > 0:
        h = totals.get('H', 0)
        ab = totals['AB']
        bb = totals.get('BB', 0)
        hbp = totals.get('HBP', 0)
        sf = totals.get('SF', 0)
        pa = totals.get('PA', ab + bb + hbp + sf)

        totals['AVG'] = round(h / ab, 3) if ab > 0 else 0
        totals['OBP'] = round((h + bb + hbp) / pa, 3) if pa > 0 else 0

        tb = h + totals.get('2B', 0) + 2 * totals.get('3B', 0) + 3 * totals.get('HR', 0)
        totals['SLG'] = round(tb / ab, 3) if ab > 0 else 0
        totals['OPS'] = round(totals['OBP'] + totals['SLG'], 3)

        totals['ISO'] = round(totals['SLG'] - totals['AVG'], 3)
        totals['BB%'] = round(100 * bb / pa, 1) if pa > 0 else 0
        totals['K%'] = round(100 * totals.get('SO', 0) / pa, 1) if pa > 0 else 0

    return totals


def calculate_batting_splits(df: pd.DataFrame) -> dict:
    """Calculate time-based splits for batters."""
    splits = {}
    today = datetime.now().date()

    # Convert date column
    if 'Date' in df.columns:
        df['_date'] = pd.to_datetime(df['Date']).dt.date
    else:
        return splits

    split_ranges = {
        'last7': 7,
        'last14': 14,
        'last30': 30,
    }

    for name, days in split_ranges.items():
        cutoff = today - timedelta(days=days)
        filtered = df[df['_date'] >= cutoff]
        if not filtered.empty:
            splits[name] = calculate_batting_season_totals(filtered)

    return splits


def calculate_pitching_season_totals(df: pd.DataFrame) -> dict:
    """Calculate season pitching totals from game logs."""
    totals = {}

    # Counting stats
    count_cols = ['G', 'GS', 'W', 'L', 'SV', 'HLD', 'BS', 'IP',
                  'H', 'R', 'ER', 'HR', 'BB', 'SO', 'HBP']
    for col in count_cols:
        if col in df.columns:
            val = df[col].sum()
            totals[col] = float(val) if col == 'IP' else int(val)

    # Calculate rate stats
    ip = totals.get('IP', 0)
    if ip > 0:
        totals['ERA'] = round(9 * totals.get('ER', 0) / ip, 2)
        totals['WHIP'] = round((totals.get('BB', 0) + totals.get('H', 0)) / ip, 2)
        totals['K/9'] = round(9 * totals.get('SO', 0) / ip, 1)
        totals['BB/9'] = round(9 * totals.get('BB', 0) / ip, 1)
        totals['HR/9'] = round(9 * totals.get('HR', 0) / ip, 1)

    # K% and BB% (need batters faced)
    bf = totals.get('H', 0) + totals.get('BB', 0) + totals.get('SO', 0) + totals.get('HBP', 0)
    if bf > 0:
        totals['K%'] = round(100 * totals.get('SO', 0) / bf, 1)
        totals['BB%'] = round(100 * totals.get('BB', 0) / bf, 1)

    return totals


def calculate_pitching_splits(df: pd.DataFrame) -> dict:
    """Calculate time-based splits for pitchers."""
    splits = {}
    today = datetime.now().date()

    if 'Date' in df.columns:
        df['_date'] = pd.to_datetime(df['Date']).dt.date
    else:
        return splits

    split_ranges = {
        'last7': 7,
        'last14': 14,
        'last30': 30,
    }

    for name, days in split_ranges.items():
        cutoff = today - timedelta(days=days)
        filtered = df[df['_date'] >= cutoff]
        if not filtered.empty:
            splits[name] = calculate_pitching_season_totals(filtered)

    return splits


def fetch_player(player_id: str, year: int) -> Optional[dict]:
    """Fetch stats for a single player (tries batter first, then pitcher)."""
    logger.info(f"Fetching stats for {player_id}...")

    # Try batter first
    stats = fetch_batter_stats(player_id, year)
    if stats:
        return stats

    # Try pitcher
    time.sleep(REQUEST_DELAY)
    stats = fetch_pitcher_stats(player_id, year)
    if stats:
        return stats

    logger.warning(f"No stats found for {player_id}")
    return None


def fetch_all_players(player_ids: list[str], year: int, use_cache: bool = True) -> dict:
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

        stats = fetch_player(player_id, year)
        if stats:
            all_stats[player_id] = stats

            # Save game logs separately
            save_game_logs(player_id, stats.get('games', []))

        # Rate limiting
        if i < len(player_ids) - 1:
            time.sleep(REQUEST_DELAY)

    # Save aggregated stats
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    with open(stats_file, 'w') as f:
        json.dump(all_stats, f, indent=2, default=str)

    logger.info(f"Saved stats for {len(all_stats)} players")
    return all_stats


def save_game_logs(player_id: str, games: list) -> None:
    """Save individual player game logs."""
    GAME_LOGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(GAME_LOGS_DIR / f'{player_id}.json', 'w') as f:
        json.dump(games, f, indent=2, default=str)


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB stats')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year (default: current year)')
    parser.add_argument('--players', type=str, default='',
                        help='Comma-separated player IDs (default: all in players.json)')
    parser.add_argument('--no-cache', action='store_true',
                        help='Ignore cached data and refresh all')
    args = parser.parse_args()

    # Enable pybaseball caching
    pyb.cache.enable()

    # Get player list
    if args.players:
        player_ids = [p.strip() for p in args.players.split(',')]
    else:
        registry = load_players()
        player_ids = [p['fangraphsId'] for p in registry.get('players', [])]

    if not player_ids:
        logger.error("No players to fetch. Add players to data/players.json or use --players")
        sys.exit(1)

    logger.info(f"Fetching stats for {len(player_ids)} players (year={args.year})")

    # Fetch stats
    fetch_all_players(player_ids, args.year, use_cache=not args.no_cache)

    logger.info("Done!")


if __name__ == '__main__':
    main()
