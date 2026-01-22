#!/usr/bin/env python3
"""
Debug script to fetch MiLB Statcast data for specific players.

This is for testing the Statcast data fetching from Baseball Savant.
It fetches Statcast data for predefined players and prints detailed output.

Note: MiLB Statcast data is only available for AAA and Florida State League games.

Usage:
    python scripts/debug_fetch_statcast.py
    python scripts/debug_fetch_statcast.py --year 2025
    python scripts/debug_fetch_statcast.py --month 6  # June only
    python scripts/debug_fetch_statcast.py --save  # Save to statcast file
"""

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

from fetch_statcast import (
    STATCAST_DIR,
    get_session,
    fetch_statcast_csv,
    parse_statcast_csv,
    aggregate_batter_statcast,
    aggregate_pitcher_statcast,
    SEASON_MONTHS,
)

# Configure logging for debug output
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Debug players - players in AAA or Florida State League with Statcast data
DEBUG_PLAYERS = [
    {'id': '694346', 'name': 'Trey Gibson', 'type': 'pitcher'},
    {'id': '806957', 'name': 'Alfredo Duno', 'type': 'batter'},
]


def fetch_player_statcast(session, player_id: str, player_type: str, year: int, month: int = None) -> dict:
    """
    Fetch Statcast data for a specific player.

    Since Baseball Savant doesn't have a direct player endpoint, we fetch
    all data for the time period and filter by player ID.
    """
    if month:
        # Specific month
        start_date = f'{year}-{month:02d}-01'
        if month == 12:
            end_date = f'{year}-12-31'
        else:
            from datetime import datetime, timedelta
            end_date = (datetime(year, month + 1, 1) - timedelta(days=1)).strftime('%Y-%m-%d')
    else:
        # Full season
        start_date = f'{year}-04-01'
        end_date = min(datetime.now(), datetime(year, 9, 30)).strftime('%Y-%m-%d')

    all_records = []

    # Fetch from both AAA and Single-A (FSL)
    for level in ['aaa', 'a']:
        player_role = 'pitcher' if player_type == 'pitcher' else 'batter'

        logger.info(f"  Fetching {level.upper()} {player_role} data...")
        csv_data = fetch_statcast_csv(session, year, start_date, end_date, player_role, level)

        if csv_data:
            records = parse_statcast_csv(csv_data)
            logger.info(f"    Got {len(records)} total records")

            # Filter for our player
            if player_type == 'pitcher':
                player_records = [r for r in records if r.get('pitcher') == player_id]
            else:
                player_records = [r for r in records if r.get('batter') == player_id]

            logger.info(f"    Found {len(player_records)} records for player {player_id}")
            all_records.extend(player_records)

    return all_records


def print_sample_records(records: list, count: int = 3):
    """Print sample raw records for debugging."""
    if not records:
        print("  No records found")
        return

    print(f"  Sample records (showing {min(count, len(records))} of {len(records)}):")
    for i, rec in enumerate(records[:count]):
        print(f"\n  Record {i + 1}:")
        # Print key fields
        key_fields = [
            'game_date', 'pitch_type', 'release_speed', 'release_spin_rate',
            'launch_speed', 'launch_angle', 'description', 'events',
            'barrel', 'bb_type', 'estimated_ba_using_speedangle',
        ]
        for field in key_fields:
            if field in rec and rec[field]:
                print(f"    {field}: {rec[field]}")


def main():
    parser = argparse.ArgumentParser(description='Debug fetch MiLB Statcast data for specific players')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year (default: current year)')
    parser.add_argument('--month', type=int, default=None,
                        help='Specific month to fetch (default: full season)')
    parser.add_argument('--save', action='store_true',
                        help='Save fetched stats to the statcast file')
    parser.add_argument('--player-id', type=str,
                        help='Fetch a specific player by ID (in addition to debug list)')
    parser.add_argument('--player-name', type=str, default='Custom Player',
                        help='Name for the custom player ID')
    parser.add_argument('--player-type', type=str, default='batter',
                        choices=['batter', 'pitcher'],
                        help='Type of the custom player')
    args = parser.parse_args()

    session = get_session()
    all_stats = {}

    # Build player list
    players = list(DEBUG_PLAYERS)
    if args.player_id:
        players.append({
            'id': args.player_id,
            'name': args.player_name,
            'type': args.player_type
        })

    print(f"\nStatcast Debug Fetch - {len(players)} players")
    print(f"Year: {args.year}")
    if args.month:
        print(f"Month: {args.month}")
    print(f"Players: {', '.join(p['name'] for p in players)}")
    print("\nNote: Statcast data is only available for AAA and Florida State League games")

    # Fetch each player
    for player in players:
        print(f"\n{'='*60}")
        print(f"Fetching: {player['name']} (ID: {player['id']}, Type: {player['type']})")
        print('='*60)

        records = fetch_player_statcast(
            session,
            player['id'],
            player['type'],
            args.year,
            args.month
        )

        print(f"\n--- Raw Records ---")
        print_sample_records(records)

        print(f"\n--- Aggregated Stats ---")
        if records:
            if player['type'] == 'pitcher':
                stats = aggregate_pitcher_statcast(records)
            else:
                stats = aggregate_batter_statcast(records)

            if stats:
                print(json.dumps(stats, indent=2))
                all_stats[player['id']] = {
                    'id': player['id'],
                    'name': player['name'],
                    'type': player['type'],
                    'bat' if player['type'] == 'batter' else 'pit': stats,
                }
            else:
                print("  No stats could be aggregated (insufficient data)")
        else:
            print("  No records found for this player")
            print("  (Player may not be in AAA or Florida State League)")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print('='*60)
    print(f"Players with Statcast data: {len(all_stats)}/{len(players)}")

    for player in players:
        pid = player['id']
        if pid in all_stats:
            stats = all_stats[pid]
            if player['type'] == 'batter':
                bat = stats.get('bat', {})
                print(f"  {player['name']}: {bat.get('BBE', 0)} BBE, "
                      f"{bat.get('EV', 0)} EV, {bat.get('LA', 0)} LA, "
                      f"{bat.get('Barrel%', 0)}% Barrel, {bat.get('Hard%', 0)}% Hard")
            else:
                pit = stats.get('pit', {})
                print(f"  {player['name']}: {pit.get('Pitches', 0)} pitches, "
                      f"{pit.get('Velo', 0)} Velo, {pit.get('SpinRate', 0)} Spin, "
                      f"{pit.get('Whiff%', 0)}% Whiff")
        else:
            print(f"  {player['name']}: No Statcast data found")

    # Save if requested
    if args.save and all_stats:
        year_dir = STATCAST_DIR / str(args.year)
        year_dir.mkdir(parents=True, exist_ok=True)

        if args.month:
            output_file = year_dir / f'{args.month:02d}.json'
        else:
            output_file = year_dir / 'debug.json'

        # Load existing and merge
        existing_players = {}
        if output_file.exists():
            with open(output_file) as f:
                data = json.load(f)
                existing_players = data.get('players', {})
            print(f"\nLoaded {len(existing_players)} existing players from {output_file}")

        # Merge new stats
        existing_players.update(all_stats)

        output = {
            'year': args.year,
            'month': args.month,
            'updated': datetime.now().isoformat(),
            'players': existing_players,
        }

        with open(output_file, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"Saved {len(existing_players)} total players to {output_file}")

    print("\nDone!")


if __name__ == '__main__':
    main()
