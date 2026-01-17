#!/usr/bin/env python3
"""
scripts/search_players.py
Search for MiLB players using FanGraphs data via pybaseball.
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from typing import Optional

import pandas as pd
import pybaseball as pyb

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def search_player_by_name(
    name: str,
    year: int = None
) -> list[dict]:
    """
    Search for a player by name using pybaseball's playerid lookup.
    Returns a list of matching players with their IDs.
    """
    if year is None:
        year = datetime.now().year

    results = []

    # Parse name into first/last
    parts = name.strip().split()
    if len(parts) >= 2:
        first = parts[0]
        last = ' '.join(parts[1:])
    else:
        # Try as last name only
        first = None
        last = name

    try:
        # Use pybaseball's playerid lookup
        if first:
            df = pyb.playerid_lookup(last, first, fuzzy=True)
        else:
            df = pyb.playerid_lookup(last, fuzzy=True)

        if df is not None and not df.empty:
            for _, row in df.iterrows():
                player = {
                    'name': f"{row.get('name_first', '')} {row.get('name_last', '')}".strip(),
                    'mlbamId': str(row.get('key_mlbam', '')) if pd.notna(row.get('key_mlbam')) else None,
                    'fangraphsId': str(row.get('key_fangraphs', '')) if pd.notna(row.get('key_fangraphs')) else None,
                    'retroId': str(row.get('key_retro', '')) if pd.notna(row.get('key_retro')) else None,
                    'bbrefId': str(row.get('key_bbref', '')) if pd.notna(row.get('key_bbref')) else None,
                    'birthYear': int(row.get('birth_year')) if pd.notna(row.get('birth_year')) else None,
                }
                # Only include if we have a FanGraphs ID
                if player['fangraphsId']:
                    results.append(player)
    except Exception as e:
        logger.warning(f"Player lookup failed: {e}")

    return results


def get_milb_players(year: int = None, level: str = None) -> list[dict]:
    """
    Get all MiLB players from FanGraphs for a given year.
    Combines batting and pitching stats to get a complete roster.
    """
    if year is None:
        year = datetime.now().year

    players = {}

    # Level mapping for FanGraphs
    level_map = {
        'AAA': 'aaa',
        'AA': 'aa',
        'A+': 'a+',
        'A': 'a',
        'CPX': 'rk',  # Complex/Rookie
    }

    levels_to_fetch = [level_map.get(level)] if level and level in level_map else list(level_map.values())

    for fg_level in levels_to_fetch:
        try:
            # Fetch batting stats
            logger.info(f"Fetching {fg_level.upper()} batters for {year}...")
            batters = pyb.fg_batting_data(year, qual=0, lg='all', ind=0, stat_columns='all', pos='all')

            if batters is not None and not batters.empty:
                # Filter for minor league level if the data supports it
                for _, row in batters.iterrows():
                    player_id = str(row.get('playerid', ''))
                    if player_id and player_id not in players:
                        name = row.get('Name', '')
                        team = row.get('Team', '')
                        players[player_id] = {
                            'fangraphsId': player_id,
                            'name': name,
                            'team': team,
                            'position': row.get('Pos', 'UTIL'),
                            'type': 'batter'
                        }
        except Exception as e:
            logger.warning(f"Failed to fetch batters for {fg_level}: {e}")

        try:
            # Fetch pitching stats
            logger.info(f"Fetching {fg_level.upper()} pitchers for {year}...")
            pitchers = pyb.fg_pitching_data(year, qual=0, lg='all', ind=0)

            if pitchers is not None and not pitchers.empty:
                for _, row in pitchers.iterrows():
                    player_id = str(row.get('playerid', ''))
                    if player_id and player_id not in players:
                        name = row.get('Name', '')
                        team = row.get('Team', '')
                        players[player_id] = {
                            'fangraphsId': player_id,
                            'name': name,
                            'team': team,
                            'position': 'P',
                            'type': 'pitcher'
                        }
        except Exception as e:
            logger.warning(f"Failed to fetch pitchers for {fg_level}: {e}")

    return list(players.values())


def search_milb_stats(
    name: str = None,
    team: str = None,
    year: int = None,
    stat_type: str = 'batting'
) -> list[dict]:
    """
    Search MiLB stats data for players matching criteria.
    This searches the actual minor league stat tables.
    """
    if year is None:
        year = datetime.now().year

    results = []

    try:
        if stat_type == 'batting':
            logger.info(f"Searching MiLB batting stats for {year}...")
            # Try to get minor league batting data
            df = pyb.fg_batting_data(year, qual=0)
        else:
            logger.info(f"Searching MiLB pitching stats for {year}...")
            df = pyb.fg_pitching_data(year, qual=0)

        if df is None or df.empty:
            logger.warning("No data returned from FanGraphs")
            return results

        # Filter by name if provided
        if name:
            name_lower = name.lower()
            df = df[df['Name'].str.lower().str.contains(name_lower, na=False)]

        # Filter by team if provided
        if team:
            team_lower = team.lower()
            df = df[df['Team'].str.lower().str.contains(team_lower, na=False)]

        # Convert to records
        for _, row in df.iterrows():
            player = {
                'fangraphsId': str(row.get('playerid', '')),
                'name': row.get('Name', ''),
                'team': row.get('Team', ''),
                'position': row.get('Pos', 'P' if stat_type == 'pitching' else 'UTIL'),
            }
            if player['fangraphsId']:
                results.append(player)

        logger.info(f"Found {len(results)} players")

    except Exception as e:
        logger.error(f"Search failed: {e}")

    return results


def main():
    parser = argparse.ArgumentParser(description='Search for MiLB players')
    parser.add_argument('--name', type=str, help='Player name to search for')
    parser.add_argument('--team', type=str, help='Team name to filter by')
    parser.add_argument('--year', type=int, default=datetime.now().year, help='Season year')
    parser.add_argument('--type', choices=['batting', 'pitching', 'both'],
                        default='both', help='Stats type to search')
    parser.add_argument('--lookup', action='store_true',
                        help='Use player ID lookup instead of stats search')
    parser.add_argument('--output', type=str, help='Output file path (default: stdout)')
    parser.add_argument('--format', choices=['json', 'table'], default='json',
                        help='Output format')

    args = parser.parse_args()

    if not args.name and not args.team:
        parser.error("At least one of --name or --team is required")

    # Enable pybaseball caching
    pyb.cache.enable()

    results = []

    if args.lookup and args.name:
        # Use player ID lookup
        results = search_player_by_name(args.name, args.year)
    else:
        # Search stats tables
        if args.type in ['batting', 'both']:
            results.extend(search_milb_stats(args.name, args.team, args.year, 'batting'))
        if args.type in ['pitching', 'both']:
            results.extend(search_milb_stats(args.name, args.team, args.year, 'pitching'))

        # Dedupe by fangraphsId
        seen = set()
        unique_results = []
        for player in results:
            if player['fangraphsId'] not in seen:
                seen.add(player['fangraphsId'])
                unique_results.append(player)
        results = unique_results

    # Output results
    if args.format == 'json':
        output = json.dumps(results, indent=2)
    else:
        # Table format
        if results:
            header = ['fangraphsId', 'name', 'team', 'position']
            lines = ['\t'.join(header)]
            for p in results:
                lines.append('\t'.join([str(p.get(h, '')) for h in header]))
            output = '\n'.join(lines)
        else:
            output = "No players found"

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        logger.info(f"Results written to {args.output}")
    else:
        print(output)


if __name__ == '__main__':
    main()
