#!/usr/bin/env python3
"""
Debug script to fetch MiLB Statcast data for specific players.

This is for testing the Statcast data fetching from Baseball Savant.
It fetches Statcast data for predefined players and prints detailed output.

Note: MiLB Statcast data is only available for AAA and Florida State League games.

Usage:
    python scripts/debug_fetch_statcast.py
    python scripts/debug_fetch_statcast.py --year 2025
    python scripts/debug_fetch_statcast.py --save  # Save to monthly statcast files
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


def fetch_player_statcast(session, player_id: str, player_type: str, year: int) -> dict:
    """
    Fetch Statcast data for a specific player for the entire season.

    Since Baseball Savant doesn't have a direct player endpoint, we fetch
    all data for the season and filter by player ID.
    """
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
    parser.add_argument('--save', action='store_true',
                        help='Save fetched stats to monthly statcast files')
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
            args.year
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

    # Save if requested (split by month)
    if args.save and all_stats:
        year_dir = STATCAST_DIR / str(args.year)
        year_dir.mkdir(parents=True, exist_ok=True)

        print(f"\nSaving Statcast stats to monthly files for {args.year}...")

        # We need to access the raw records to split by month
        # Let's re-fetch and organize by month
        months_with_data = {}

        for player in players:
            print(f"\nProcessing {player['name']} for monthly files...")

            # Re-fetch records
            records = fetch_player_statcast(
                session,
                player['id'],
                player['type'],
                args.year
            )

            # Split records by month
            for record in records:
                game_date = record.get('game_date', '')
                if game_date and len(game_date) >= 7:  # Format: YYYY-MM-DD
                    month = int(game_date[5:7])  # Extract month

                    if month not in months_with_data:
                        months_with_data[month] = {}

                    if player['id'] not in months_with_data[month]:
                        months_with_data[month][player['id']] = []

                    months_with_data[month][player['id']].append(record)

        # Save each month's data
        months_saved = []
        for month in SEASON_MONTHS:
            if month not in months_with_data:
                continue

            month_file = year_dir / f'{month:02d}.json'

            # Load existing stats
            existing_players = {}
            if month_file.exists():
                with open(month_file) as f:
                    data = json.load(f)
                    existing_players = data.get('players', {})

            # Process and aggregate stats for this month
            month_player_count = 0
            for player_id, records in months_with_data[month].items():
                # Find player info
                player_info = next(p for p in players if p['id'] == player_id)

                # Aggregate stats
                if player_info['type'] == 'pitcher':
                    stats = aggregate_pitcher_statcast(records)
                else:
                    stats = aggregate_batter_statcast(records)

                if stats:
                    existing_players[player_id] = {
                        'id': player_id,
                        'name': player_info['name'],
                        'type': player_info['type'],
                        'bat' if player_info['type'] == 'batter' else 'pit': stats,
                    }
                    month_player_count += 1

            # Save this month's file
            if month_player_count > 0:
                output = {
                    'year': args.year,
                    'month': month,
                    'updated': datetime.now().isoformat(),
                    'players': existing_players,
                }

                with open(month_file, 'w') as f:
                    json.dump(output, f, indent=2)

                print(f"  Month {month:02d}: Saved {month_player_count} players ({len(existing_players)} total)")
                months_saved.append(month)

        print(f"\nSaved Statcast stats to {len(months_saved)} monthly files")

    print("\nDone!")


if __name__ == '__main__':
    main()
