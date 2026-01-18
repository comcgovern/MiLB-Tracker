#!/usr/bin/env python3
"""
scripts/fetch_statcast.py
Fetch MiLB Statcast data for AAA and other tracked levels.

Note: Statcast data for MiLB is limited compared to MLB. The MLB Stats API
provides basic pitch-level data for some AAA games, but full Statcast metrics
(exit velocity, launch angle, spin rate, etc.) are only available at AAA level
through Baseball Savant's minor league search.

This script fetches what's available through the official API and can be
extended to scrape Baseball Savant for more detailed metrics.
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

from mlbstatsapi import Mlb

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / 'data'
STATCAST_DIR = DATA_DIR / 'statcast'
PLAYERS_FILE = DATA_DIR / 'players.json'


def load_players() -> list[dict]:
    """Load the player registry."""
    if PLAYERS_FILE.exists():
        with open(PLAYERS_FILE) as f:
            data = json.load(f)
            return data.get('players', [])
    return []


def fetch_player_game_stats(mlb: Mlb, player_id: int, game_id: int) -> dict | None:
    """
    Fetch detailed stats for a player in a specific game.

    This uses the get_players_stats_for_game endpoint which provides
    per-game fielding, hitting, and pitching statistics.
    """
    try:
        stats = mlb.get_players_stats_for_game(player_id, game_id)
        return stats
    except Exception as e:
        logger.debug(f"Failed to fetch game stats for player {player_id}, game {game_id}: {e}")
        return None


def fetch_player_advanced_stats(mlb: Mlb, player_id: int, year: int) -> dict | None:
    """
    Fetch advanced stats for a player using available stat types.

    Note: Full Statcast metrics may not be available for minor league players.
    """
    try:
        # Try to get advanced stats if available
        stats = mlb.get_player_stats(
            player_id,
            stats=['seasonAdvanced', 'season'],
            groups=['hitting', 'pitching'],
            season=year
        )
        return stats
    except Exception as e:
        logger.debug(f"Failed to fetch advanced stats for player {player_id}: {e}")
        return None


def fetch_statcast_data(mlb: Mlb, year: int, player_ids: list[str] = None) -> dict:
    """
    Fetch available Statcast-like data for MiLB players.

    For full Statcast metrics (exit velocity, launch angle, spin rate),
    you would need to scrape baseballsavant.mlb.com/statcast-search-minors
    as the MLB Stats API has limited Statcast data for minor leagues.
    """
    data = {
        'lastUpdated': datetime.now().isoformat(),
        'year': year,
        'players': {},
        'note': 'Limited Statcast data available for MiLB through API'
    }

    if not player_ids:
        # Load from registry
        players = load_players()
        player_ids = []
        for p in players:
            pid = p.get('mlbId') or p.get('fangraphsId')
            if pid:
                player_ids.append(str(pid))

    if not player_ids:
        logger.warning("No players specified")
        return data

    for player_id in player_ids:
        try:
            logger.info(f"Fetching advanced stats for player {player_id}...")
            stats = fetch_player_advanced_stats(mlb, int(player_id), year)

            if stats:
                player_data = {
                    'playerId': player_id,
                    'lastUpdated': datetime.now().isoformat(),
                }

                # Extract advanced hitting stats if available
                if 'hitting' in stats:
                    hitting = stats['hitting']
                    if 'seasonadvanced' in hitting and hitting['seasonadvanced']:
                        adv = hitting['seasonadvanced']
                        if hasattr(adv, 'splits') and adv.splits:
                            split = adv.splits[0]
                            if hasattr(split, 'stat'):
                                player_data['advancedHitting'] = extract_advanced_stats(split.stat)

                # Extract advanced pitching stats if available
                if 'pitching' in stats:
                    pitching = stats['pitching']
                    if 'seasonadvanced' in pitching and pitching['seasonadvanced']:
                        adv = pitching['seasonadvanced']
                        if hasattr(adv, 'splits') and adv.splits:
                            split = adv.splits[0]
                            if hasattr(split, 'stat'):
                                player_data['advancedPitching'] = extract_advanced_stats(split.stat)

                if 'advancedHitting' in player_data or 'advancedPitching' in player_data:
                    data['players'][player_id] = player_data

        except Exception as e:
            logger.warning(f"Error fetching data for player {player_id}: {e}")

    return data


def extract_advanced_stats(stat) -> dict:
    """Extract advanced stats from a stat object."""
    stats = {}

    # Common advanced metrics that might be available
    advanced_attrs = [
        'babip', 'iso', 'woba', 'wrc', 'wrcplus', 'war',
        'leftOnBase', 'sacFlies', 'sacBunts',
        'groundOuts', 'airOuts', 'groundOutsToAirouts',
        'catchersInterference', 'plateAppearances',
        'totalBases', 'extraBaseHits', 'intentionalWalks',
        'pitchesPerPlateAppearance', 'atBatsPerHomeRun',
        # Pitching advanced
        'winPercentage', 'pitchesPerInning', 'runsScoredPer9',
        'homeRunsPer9', 'inheritedRunners', 'inheritedRunnersScored',
        'battersFaced', 'obp', 'slg', 'ops',
    ]

    for attr in advanced_attrs:
        val = getattr(stat, attr, None)
        if val is not None:
            stats[attr] = val

    return stats


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB Statcast/advanced data')
    parser.add_argument('--year', type=int, default=datetime.now().year)
    parser.add_argument('--players', type=str, default='',
                        help='Comma-separated player IDs')
    args = parser.parse_args()

    player_ids = [p.strip() for p in args.players.split(',')] if args.players else None

    # Initialize MLB API client
    mlb = Mlb()

    # Fetch data
    data = fetch_statcast_data(mlb, args.year, player_ids)

    # Save
    STATCAST_DIR.mkdir(parents=True, exist_ok=True)

    with open(STATCAST_DIR / f'{args.year}.json', 'w') as f:
        json.dump(data, f, indent=2)

    player_count = len(data.get('players', {}))
    logger.info(f"Saved advanced stats for {player_count} players")

    if player_count == 0:
        logger.info("Note: Limited Statcast data available for MiLB through the API.")
        logger.info("For full metrics, consider scraping Baseball Savant's MiLB search.")


if __name__ == '__main__':
    main()
