#!/usr/bin/env python3
"""
Debug script to fetch MiLB stats for specific players.

This is a simplified version of fetch_stats.py for debugging purposes.
It fetches stats for a predefined list of players and prints detailed output.

Usage:
    python scripts/debug_fetch_players.py
    python scripts/debug_fetch_players.py --season 2024
    python scripts/debug_fetch_players.py --save  # Save to stats file
    python scripts/debug_fetch_players.py --month 6  # Save to June file
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
    SEASON_MONTHS,
    fetch_player_stats,
    get_player_milb_stats,
    filter_player_stats_by_month,
    update_manifest,
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
    parser.add_argument('--month', type=int, default=None,
                        help='Month to save (default: current month)')
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

    # Save if requested (using monthly file structure)
    if args.save and all_stats:
        # Determine which month to save to
        if args.month:
            month = args.month
        else:
            month = datetime.now().month
            if month not in SEASON_MONTHS:
                print(f"\nWarning: Month {month} is outside season (April-September)")
                print("Use --month to specify a different month")
                month = SEASON_MONTHS[-1]  # Default to September

        year_dir = STATS_DIR / str(args.season)
        year_dir.mkdir(parents=True, exist_ok=True)
        month_file = year_dir / f'{month:02d}.json'

        # Load existing stats and merge
        existing_players = {}
        if month_file.exists():
            with open(month_file) as f:
                data = json.load(f)
                existing_players = data.get('players', {})
            print(f"\nLoaded {len(existing_players)} existing players from {month_file}")

        # Filter stats to just this month and merge
        for player_id, player_stats in all_stats.items():
            month_stats = filter_player_stats_by_month(player_stats, args.season, month)
            if month_stats:
                existing_players[player_id] = month_stats

        # Save
        output = {
            'year': args.season,
            'month': month,
            'updated': datetime.now().isoformat(),
            'players': existing_players,
        }

        with open(month_file, 'w') as f:
            json.dump(output, f, separators=(',', ':'))

        print(f"Saved {len(existing_players)} total players to {month_file}")

        # Update manifest
        existing_months = [
            int(f.stem) for f in year_dir.glob('*.json')
            if f.stem.isdigit()
        ]
        if existing_months:
            update_manifest(args.season, existing_months)

    print("\nDone!")


if __name__ == '__main__':
    main()
