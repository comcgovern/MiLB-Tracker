#!/usr/bin/env python3
"""
scripts/fetch_statcast.py
Fetch MiLB Statcast data for AAA and other tracked levels.
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
import pybaseball as pyb

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / 'data'
STATCAST_DIR = DATA_DIR / 'statcast'


def fetch_statcast_batters(year: int, player_ids: list[str] = None) -> dict:
    """
    Fetch Statcast batting data for AAA players.

    Note: pybaseball's statcast functions work for MLB. For MiLB,
    we may need to scrape Baseball Savant's MiLB Statcast search directly.
    This is a placeholder that shows the structure.
    """
    try:
        # For now, fetch leaderboard data
        # In production, you'd scrape baseballsavant.mlb.com/statcast-search-minors
        logger.info("Fetching Statcast batter data...")

        # Example: fetch exit velocity leaderboard
        # df = pyb.statcast_batter_exitvelo_barrels(year)

        # Placeholder structure
        data = {
            'lastUpdated': datetime.now().isoformat(),
            'players': {}
        }

        return data
    except Exception as e:
        logger.error(f"Failed to fetch Statcast data: {e}")
        return {}


def fetch_statcast_pitchers(year: int, player_ids: list[str] = None) -> dict:
    """Fetch Statcast pitching data for AAA players."""
    try:
        logger.info("Fetching Statcast pitcher data...")

        data = {
            'lastUpdated': datetime.now().isoformat(),
            'players': {}
        }

        return data
    except Exception as e:
        logger.error(f"Failed to fetch Statcast pitcher data: {e}")
        return {}


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB Statcast data')
    parser.add_argument('--year', type=int, default=datetime.now().year)
    parser.add_argument('--players', type=str, default='',
                        help='Comma-separated player IDs')
    args = parser.parse_args()

    player_ids = [p.strip() for p in args.players.split(',')] if args.players else None

    # Fetch data
    batters = fetch_statcast_batters(args.year, player_ids)
    pitchers = fetch_statcast_pitchers(args.year, player_ids)

    # Merge and save
    STATCAST_DIR.mkdir(parents=True, exist_ok=True)

    combined = {
        'lastUpdated': datetime.now().isoformat(),
        'batters': batters.get('players', {}),
        'pitchers': pitchers.get('players', {})
    }

    with open(STATCAST_DIR / f'{args.year}.json', 'w') as f:
        json.dump(combined, f, indent=2)

    logger.info("Statcast data saved")


if __name__ == '__main__':
    main()
