#!/usr/bin/env python3
"""
scripts/build_player_index.py
Build a searchable index of all MiLB players from FanGraphs.
This creates a static JSON file that the frontend can use to search for players.
"""

import argparse
import json
import logging
import time
from datetime import datetime
from pathlib import Path

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
INDEX_FILE = DATA_DIR / 'player-index.json'
PLAYERS_FILE = DATA_DIR / 'players.json'

# MiLB levels and their FanGraphs level codes
MILB_LEVELS = {
    'AAA': 11,
    'AA': 12,
    'A+': 13,  # High-A
    'A': 14,   # Single-A
    'CPX': 16, # Rookie/Complex
}


def get_milb_batters(year: int, level_code: int) -> pd.DataFrame:
    """Fetch MiLB batters for a specific level."""
    try:
        # Use FanGraphs minor league stats
        df = pyb.fg_batting_data(
            year,
            qual=1,  # At least 1 PA
        )
        if df is not None and not df.empty:
            # Add level info
            df['level_code'] = level_code
            return df
    except Exception as e:
        logger.warning(f"Failed to fetch batters: {e}")
    return pd.DataFrame()


def get_milb_pitchers(year: int, level_code: int) -> pd.DataFrame:
    """Fetch MiLB pitchers for a specific level."""
    try:
        df = pyb.fg_pitching_data(
            year,
            qual=1,  # At least 1 IP
        )
        if df is not None and not df.empty:
            df['level_code'] = level_code
            return df
    except Exception as e:
        logger.warning(f"Failed to fetch pitchers: {e}")
    return pd.DataFrame()


def get_milb_stats(year: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Fetch all MiLB stats for a year using pybaseball."""
    try:
        # Get minor league batting stats
        logger.info(f"Fetching MiLB batting stats for {year}...")
        batters = pyb.milb_stats(
            stat_type='hitting',
            year=year,
        )

        # Get minor league pitching stats
        logger.info(f"Fetching MiLB pitching stats for {year}...")
        pitchers = pyb.milb_stats(
            stat_type='pitching',
            year=year,
        )

        return batters, pitchers
    except Exception as e:
        logger.error(f"Failed to fetch MiLB stats: {e}")
        return pd.DataFrame(), pd.DataFrame()


def load_existing_players() -> set:
    """Load existing player IDs from the registry."""
    if PLAYERS_FILE.exists():
        with open(PLAYERS_FILE) as f:
            data = json.load(f)
            return {p['fangraphsId'] for p in data.get('players', [])}
    return set()


def build_index(year: int = None) -> list[dict]:
    """Build the player index from FanGraphs data."""
    if year is None:
        year = datetime.now().year

    players = {}
    existing_ids = load_existing_players()

    # Try to get MiLB stats
    batters, pitchers = get_milb_stats(year)

    # Process batters
    if batters is not None and not batters.empty:
        logger.info(f"Processing {len(batters)} batters...")
        for _, row in batters.iterrows():
            player_id = str(row.get('player_id', row.get('playerid', row.get('key_fangraphs', ''))))
            if not player_id or player_id == 'nan':
                continue

            # Determine level from the level column or affiliate
            level = 'A+'  # Default
            level_col = str(row.get('level', row.get('Level', ''))).upper()
            if 'AAA' in level_col:
                level = 'AAA'
            elif 'AA' in level_col:
                level = 'AA'
            elif 'HIGH' in level_col or 'A+' in level_col:
                level = 'A+'
            elif 'LOW' in level_col or level_col == 'A':
                level = 'A'
            elif 'ROOKIE' in level_col or 'CPX' in level_col:
                level = 'CPX'

            # Get team info
            team = str(row.get('team', row.get('Team', row.get('affiliate', 'Unknown'))))
            org = str(row.get('org', row.get('parent_org', '')))[:3].upper() if row.get('org') or row.get('parent_org') else ''

            # Get name
            name = row.get('name', row.get('Name', row.get('player_name', '')))
            if pd.isna(name) or not name:
                continue

            # Position
            pos = str(row.get('pos', row.get('Pos', row.get('position', 'UTIL'))))
            if pd.isna(pos):
                pos = 'UTIL'

            players[player_id] = {
                'fangraphsId': player_id,
                'name': str(name),
                'team': team if team and team != 'nan' else 'Unknown',
                'org': org if org and org != 'NAN' else '',
                'level': level,
                'position': pos,
                'type': 'batter',
                'inRegistry': player_id in existing_ids,
            }

    # Process pitchers
    if pitchers is not None and not pitchers.empty:
        logger.info(f"Processing {len(pitchers)} pitchers...")
        for _, row in pitchers.iterrows():
            player_id = str(row.get('player_id', row.get('playerid', row.get('key_fangraphs', ''))))
            if not player_id or player_id == 'nan':
                continue

            # Skip if already added as batter
            if player_id in players:
                continue

            # Determine level
            level = 'A+'
            level_col = str(row.get('level', row.get('Level', ''))).upper()
            if 'AAA' in level_col:
                level = 'AAA'
            elif 'AA' in level_col:
                level = 'AA'
            elif 'HIGH' in level_col or 'A+' in level_col:
                level = 'A+'
            elif 'LOW' in level_col or level_col == 'A':
                level = 'A'
            elif 'ROOKIE' in level_col or 'CPX' in level_col:
                level = 'CPX'

            team = str(row.get('team', row.get('Team', row.get('affiliate', 'Unknown'))))
            org = str(row.get('org', row.get('parent_org', '')))[:3].upper() if row.get('org') or row.get('parent_org') else ''

            name = row.get('name', row.get('Name', row.get('player_name', '')))
            if pd.isna(name) or not name:
                continue

            players[player_id] = {
                'fangraphsId': player_id,
                'name': str(name),
                'team': team if team and team != 'nan' else 'Unknown',
                'org': org if org and org != 'NAN' else '',
                'level': level,
                'position': 'P',
                'type': 'pitcher',
                'inRegistry': player_id in existing_ids,
            }

    result = list(players.values())
    logger.info(f"Built index with {len(result)} players")
    return result


def main():
    parser = argparse.ArgumentParser(description='Build MiLB player index')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year')
    parser.add_argument('--output', type=str,
                        help='Output file path (default: data/player-index.json)')

    args = parser.parse_args()

    # Enable pybaseball caching
    pyb.cache.enable()

    # Build index
    players = build_index(args.year)

    # Prepare output
    output_data = {
        'players': players,
        'year': args.year,
        'lastUpdated': datetime.now().isoformat(),
        'count': len(players),
    }

    # Save
    output_path = Path(args.output) if args.output else INDEX_FILE
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)

    logger.info(f"Saved index to {output_path}")


if __name__ == '__main__':
    main()
