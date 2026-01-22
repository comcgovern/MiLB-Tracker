#!/usr/bin/env python3
"""
Debug script to fetch MiLB stats for specific players.

This is a simplified version of fetch_stats.py for debugging purposes.
It fetches stats for a predefined list of players and prints detailed output.

Usage:
    python scripts/debug_fetch_players.py
    python scripts/debug_fetch_players.py --season 2024
    python scripts/debug_fetch_players.py --save  # Save to stats file
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

from fetch_stats import (
    APIClient,
    DATA_DIR,
    STATS_DIR,
    fetch_player_stats,
    get_player_milb_stats,
)

# Configure logging for debug output
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Debug players - add more as needed
DEBUG_PLAYERS = [
    {'id': 692478, 'name': 'Victor Arias'},
    {'id': 694346, 'name': 'Trey Gibson'},
    {'id': 806957, 'name': 'Alfredo Duno'},
]


def fetch_and_print_player(client: APIClient, player_id: int, name: str, season: int) -> dict | None:
    """Fetch stats for a single player and print detailed output."""
    print(f"\n{'='*60}")
    print(f"Fetching stats for: {name} (ID: {player_id})")
    print(f"Season: {season}")
    print('='*60)

    # Fetch raw data
    print("\n--- Raw Hitting Data ---")
    hitting_data = get_player_milb_stats(client, player_id, season, 'hitting')
    if hitting_data:
        print(json.dumps(hitting_data, indent=2)[:2000])  # Truncate for readability
        if len(json.dumps(hitting_data)) > 2000:
            print("... (truncated)")
    else:
        print("No hitting data returned")

    print("\n--- Raw Pitching Data ---")
    pitching_data = get_player_milb_stats(client, player_id, season, 'pitching')
    if pitching_data:
        print(json.dumps(pitching_data, indent=2)[:2000])
        if len(json.dumps(pitching_data)) > 2000:
            print("... (truncated)")
    else:
        print("No pitching data returned")

    # Fetch processed stats
    print("\n--- Processed Stats ---")
    stats = fetch_player_stats(client, player_id, season)
    if stats:
        print(json.dumps(stats, indent=2))
    else:
        print("No stats extracted")

    return stats


def main():
    parser = argparse.ArgumentParser(description='Debug fetch MiLB stats for specific players')
    parser.add_argument('--season', type=int, default=datetime.now().year,
                        help='Season year (default: current year)')
    parser.add_argument('--save', action='store_true',
                        help='Save fetched stats to the stats file (merges with existing)')
    parser.add_argument('--player-id', type=int,
                        help='Fetch a specific player by ID (in addition to debug list)')
    parser.add_argument('--player-name', type=str, default='Custom Player',
                        help='Name for the custom player ID')
    args = parser.parse_args()

    client = APIClient()
    all_stats = {}

    # Build player list
    players = list(DEBUG_PLAYERS)
    if args.player_id:
        players.append({'id': args.player_id, 'name': args.player_name})

    print(f"\nDebug Fetch - {len(players)} players")
    print(f"Season: {args.season}")
    print(f"Players: {', '.join(p['name'] for p in players)}")

    # Fetch each player
    for player in players:
        stats = fetch_and_print_player(client, player['id'], player['name'], args.season)
        if stats:
            all_stats[str(player['id'])] = stats

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    print(f"Players fetched: {len(all_stats)}/{len(players)}")

    for player in players:
        pid = str(player['id'])
        if pid in all_stats:
            stats = all_stats[pid]
            player_type = stats.get('type', 'unknown')
            if player_type == 'batter':
                batting = stats.get('batting', {})
                print(f"  {player['name']}: {batting.get('G', 0)} G, "
                      f"{batting.get('AVG', 0):.3f} AVG, {batting.get('HR', 0)} HR, "
                      f"{batting.get('OPS', 0):.3f} OPS")
            else:
                pitching = stats.get('pitching', {})
                print(f"  {player['name']}: {pitching.get('G', 0)} G, "
                      f"{pitching.get('IP', 0)} IP, {pitching.get('ERA', 0):.2f} ERA, "
                      f"{pitching.get('SO', 0)} K")
        else:
            print(f"  {player['name']}: No stats found")

    # Save if requested
    if args.save and all_stats:
        STATS_DIR.mkdir(parents=True, exist_ok=True)
        stats_file = STATS_DIR / f'{args.season}.json'

        # Load existing stats and merge
        existing = {}
        if stats_file.exists():
            with open(stats_file) as f:
                existing = json.load(f)
            print(f"\nLoaded {len(existing)} existing players from {stats_file}")

        # Merge new stats
        existing.update(all_stats)

        with open(stats_file, 'w') as f:
            json.dump(existing, f, separators=(',', ':'))

        print(f"Saved {len(existing)} total players to {stats_file}")

    print("\nDone!")


if __name__ == '__main__':
    main()
