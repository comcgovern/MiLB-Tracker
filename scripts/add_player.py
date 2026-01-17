#!/usr/bin/env python3
"""
scripts/add_player.py
Add a player to the MiLB Tracker registry and optionally fetch their stats.
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime
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
PLAYERS_FILE = DATA_DIR / 'players.json'
STATS_DIR = DATA_DIR / 'stats'
GAME_LOGS_DIR = DATA_DIR / 'game-logs'

# Team/Org mapping for MLB organizations
MLB_ORGS = {
    'ARI': 'Arizona Diamondbacks',
    'ATL': 'Atlanta Braves',
    'BAL': 'Baltimore Orioles',
    'BOS': 'Boston Red Sox',
    'CHC': 'Chicago Cubs',
    'CHW': 'Chicago White Sox',
    'CIN': 'Cincinnati Reds',
    'CLE': 'Cleveland Guardians',
    'COL': 'Colorado Rockies',
    'DET': 'Detroit Tigers',
    'HOU': 'Houston Astros',
    'KC': 'Kansas City Royals',
    'LAA': 'Los Angeles Angels',
    'LAD': 'Los Angeles Dodgers',
    'MIA': 'Miami Marlins',
    'MIL': 'Milwaukee Brewers',
    'MIN': 'Minnesota Twins',
    'NYM': 'New York Mets',
    'NYY': 'New York Yankees',
    'OAK': 'Oakland Athletics',
    'PHI': 'Philadelphia Phillies',
    'PIT': 'Pittsburgh Pirates',
    'SD': 'San Diego Padres',
    'SF': 'San Francisco Giants',
    'SEA': 'Seattle Mariners',
    'STL': 'St. Louis Cardinals',
    'TB': 'Tampa Bay Rays',
    'TEX': 'Texas Rangers',
    'TOR': 'Toronto Blue Jays',
    'WSH': 'Washington Nationals',
}


def load_players() -> dict:
    """Load the player registry."""
    if PLAYERS_FILE.exists():
        with open(PLAYERS_FILE) as f:
            return json.load(f)
    return {'players': [], 'lastUpdated': datetime.now().isoformat()}


def save_players(data: dict) -> None:
    """Save the player registry."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data['lastUpdated'] = datetime.now().isoformat()
    with open(PLAYERS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def lookup_player_info(name: str) -> Optional[dict]:
    """Look up player info by name using pybaseball."""
    parts = name.strip().split()
    if len(parts) >= 2:
        first = parts[0]
        last = ' '.join(parts[1:])
    else:
        first = None
        last = name

    try:
        if first:
            df = pyb.playerid_lookup(last, first, fuzzy=True)
        else:
            df = pyb.playerid_lookup(last, fuzzy=True)

        if df is not None and not df.empty:
            # Return the first match
            row = df.iloc[0]
            return {
                'name': f"{row.get('name_first', '')} {row.get('name_last', '')}".strip(),
                'mlbamId': str(int(row.get('key_mlbam'))) if pd.notna(row.get('key_mlbam')) else None,
                'fangraphsId': str(int(row.get('key_fangraphs'))) if pd.notna(row.get('key_fangraphs')) else None,
            }
    except Exception as e:
        logger.warning(f"Player lookup failed: {e}")

    return None


def determine_level_from_team(team_name: str) -> str:
    """Determine the MiLB level from the team name."""
    team_lower = team_name.lower()

    # AAA teams often have keywords
    if any(kw in team_lower for kw in ['clippers', 'ironpigs', 'sounds', 'aces', 'aviators', 'stripers', 'knights', 'bats', 'express', 'grizzlies', 'isotopes', 'jumbo', 'redbirds', 'rainiers', 'red wings', 'river cats', 'storm chasers', 'tides', 'mud hens', 'bulls', 'buffalo', 'columbus', 'toledo', 'indianapolis', 'louisville', 'nashville', 'memphis', 'sacramento', 'el paso', 'round rock', 'sugar land', 'reno', 'las vegas', 'tacoma', 'salt lake', 'albuquerque']):
        return 'AAA'

    # AA teams
    if any(kw in team_lower for kw in ['rumble', 'ponies', 'wind surge', 'trash pandas', 'barons', 'lookouts', 'biscuits', 'shuckers', 'pensacola', 'biloxi', 'birmingham', 'chattanooga', 'mississippi', 'montgomery', 'tennessee', 'rocket city', 'hartford', 'bowie', 'harrisburg', 'reading', 'somerset', 'akron', 'altoona', 'erie', 'richmond', 'midland', 'corpus christi', 'frisco', 'springfield', 'tulsa', 'arkansas', 'northwest arkansas', 'wichita', 'san antonio', 'amarillo']):
        return 'AA'

    # A+ teams
    if any(kw in team_lower for kw in ['fireflies', 'pelicans', 'woodpeckers', 'grasshoppers', 'dash', 'keys', 'blue rocks', 'hudson valley', 'brooklyn', 'jersey shore', 'wilmington', 'greensboro', 'asheville', 'rome', 'bowling green', 'dayton', 'fort wayne', 'great lakes', 'lansing', 'lake county', 'south bend', 'west michigan', 'peoria', 'quad cities', 'wisconsin', 'beloit', 'cedar rapids', 'fort myers', 'jupiter', 'palm beach', 'clearwater', 'dunedin', 'tampa', 'lakeland', 'daytona', 'st. lucie', 'spokane', 'everett', 'eugene', 'hillsboro', 'vancouver', 'tri-city', 'stockton', 'modesto', 'san jose', 'rancho cucamonga', 'inland empire', 'lake elsinore', 'visalia']):
        return 'A+'

    # A teams
    if any(kw in team_lower for kw in ['delmarva', 'augusta', 'charleston', 'kannapolis', 'fayetteville', 'myrtle beach', 'carolina', 'down east', 'columbia', 'salem']):
        return 'A'

    # Default to A+ if uncertain
    return 'A+'


def extract_org_from_team(team_name: str) -> str:
    """Try to extract the MLB org abbreviation from team name."""
    # This is a simplified mapping - in practice you might need a more comprehensive one
    team_lower = team_name.lower()

    # Direct team-to-org mappings (common MiLB teams)
    team_org_map = {
        'clippers': 'CLE',
        'mud hens': 'DET',
        'ironpigs': 'PHI',
        'reading': 'PHI',
        'fightin phils': 'PHI',
        'bisons': 'TOR',
        'red wings': 'WSH',
        'rainiers': 'SEA',
        'aviators': 'OAK',
        'rockhounds': 'OAK',
        'river cats': 'SF',
        'sounds': 'MIL',
        'aces': 'ARI',
        'isotopes': 'COL',
        'express': 'TEX',
        'storm chasers': 'KC',
        'grizzlies': 'ARI',
        'tides': 'NYM',
        'stripers': 'ATL',
        'knights': 'CHW',
        'bats': 'CIN',
        'jumbo shrimp': 'MIA',
        'durham bulls': 'TB',
        'scranton': 'NYY',
        'railriders': 'NYY',
        'worcester': 'BOS',
        'red sox': 'BOS',
        'syracuse': 'NYM',
        'pirates': 'PIT',
    }

    for keyword, org in team_org_map.items():
        if keyword in team_lower:
            return org

    return 'UNK'


def add_player(
    fangraphs_id: str = None,
    name: str = None,
    team: str = None,
    org: str = None,
    level: str = None,
    position: str = None,
    mlbam_id: str = None,
    lookup: bool = False,
    fetch_stats: bool = False,
    year: int = None
) -> dict:
    """
    Add a player to the registry.

    Args:
        fangraphs_id: FanGraphs player ID (required if not using lookup)
        name: Player name (required)
        team: Team name
        org: MLB organization abbreviation (e.g., 'PIT')
        level: MiLB level ('AAA', 'AA', 'A+', 'A', 'CPX')
        position: Player position
        mlbam_id: MLB Advanced Media ID
        lookup: Whether to look up player info from name
        fetch_stats: Whether to fetch stats after adding
        year: Season year for stats

    Returns:
        The added player dict
    """
    if year is None:
        year = datetime.now().year

    # Enable pybaseball caching
    pyb.cache.enable()

    # If lookup is requested, try to find player info
    if lookup and name and not fangraphs_id:
        logger.info(f"Looking up player info for: {name}")
        player_info = lookup_player_info(name)
        if player_info:
            logger.info(f"Found player: {player_info}")
            if not fangraphs_id:
                fangraphs_id = player_info.get('fangraphsId')
            if not mlbam_id:
                mlbam_id = player_info.get('mlbamId')
            if not name or name == player_info.get('name', '').split()[0]:
                name = player_info.get('name')

    # Validate required fields
    if not fangraphs_id:
        raise ValueError("fangraphs_id is required (or use --lookup with a name)")
    if not name:
        raise ValueError("name is required")

    # Load existing registry
    registry = load_players()

    # Check if player already exists
    existing_ids = {p['fangraphsId'] for p in registry['players']}
    if fangraphs_id in existing_ids:
        logger.warning(f"Player {fangraphs_id} already exists in registry")
        for p in registry['players']:
            if p['fangraphsId'] == fangraphs_id:
                return p
        raise ValueError(f"Player {fangraphs_id} exists but couldn't be found")

    # Determine level if not provided
    if not level and team:
        level = determine_level_from_team(team)
        logger.info(f"Determined level: {level}")

    # Determine org if not provided
    if not org and team:
        org = extract_org_from_team(team)
        logger.info(f"Determined org: {org}")

    # Build player record
    player = {
        'fangraphsId': fangraphs_id,
        'name': name,
        'team': team or 'Unknown',
        'org': org or 'UNK',
        'level': level or 'A+',
        'position': position or 'UTIL',
        'hasStatcast': False,
    }

    if mlbam_id:
        player['mlbamId'] = mlbam_id

    # Add to registry
    registry['players'].append(player)
    save_players(registry)
    logger.info(f"Added player to registry: {player['name']} ({player['fangraphsId']})")

    # Fetch stats if requested
    if fetch_stats:
        logger.info(f"Fetching stats for {player['fangraphsId']}...")
        from fetch_stats import fetch_player, save_game_logs

        stats = fetch_player(fangraphs_id, year)
        if stats:
            # Save to stats file
            stats_file = STATS_DIR / f'{year}.json'
            STATS_DIR.mkdir(parents=True, exist_ok=True)

            all_stats = {}
            if stats_file.exists():
                with open(stats_file) as f:
                    all_stats = json.load(f)

            all_stats[fangraphs_id] = stats
            with open(stats_file, 'w') as f:
                json.dump(all_stats, f, indent=2, default=str)

            # Save game logs
            save_game_logs(fangraphs_id, stats.get('games', []))
            logger.info(f"Fetched and saved stats for {player['name']}")
        else:
            logger.warning(f"Could not fetch stats for {player['name']}")

    return player


def add_players_bulk(players_data: list[dict], fetch_stats: bool = False, year: int = None) -> list[dict]:
    """Add multiple players at once."""
    added = []
    for player_data in players_data:
        try:
            player = add_player(
                fangraphs_id=player_data.get('fangraphsId'),
                name=player_data.get('name'),
                team=player_data.get('team'),
                org=player_data.get('org'),
                level=player_data.get('level'),
                position=player_data.get('position'),
                mlbam_id=player_data.get('mlbamId'),
                fetch_stats=fetch_stats,
                year=year
            )
            added.append(player)
            if fetch_stats:
                time.sleep(2)  # Rate limiting
        except Exception as e:
            logger.error(f"Failed to add player {player_data}: {e}")

    return added


def main():
    parser = argparse.ArgumentParser(description='Add a player to the MiLB Tracker registry')

    # Single player mode
    parser.add_argument('--id', type=str, dest='fangraphs_id',
                        help='FanGraphs player ID')
    parser.add_argument('--name', type=str, help='Player name')
    parser.add_argument('--team', type=str, help='Team name')
    parser.add_argument('--org', type=str, help='MLB organization (e.g., PIT)')
    parser.add_argument('--level', type=str, choices=['AAA', 'AA', 'A+', 'A', 'CPX'],
                        help='MiLB level')
    parser.add_argument('--position', type=str, help='Player position')
    parser.add_argument('--mlbam-id', type=str, help='MLB Advanced Media ID')
    parser.add_argument('--lookup', action='store_true',
                        help='Look up player info from name')

    # Bulk mode
    parser.add_argument('--bulk', type=str,
                        help='Path to JSON file with players to add')

    # Options
    parser.add_argument('--fetch-stats', action='store_true',
                        help='Fetch stats after adding')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year')
    parser.add_argument('--output', type=str,
                        help='Output file for results (default: stdout)')

    args = parser.parse_args()

    results = []

    if args.bulk:
        # Bulk add mode
        with open(args.bulk) as f:
            players_data = json.load(f)
        results = add_players_bulk(players_data, args.fetch_stats, args.year)
    else:
        # Single player mode
        if not args.name and not args.fangraphs_id:
            parser.error("Either --name or --id is required")

        try:
            player = add_player(
                fangraphs_id=args.fangraphs_id,
                name=args.name,
                team=args.team,
                org=args.org,
                level=args.level,
                position=args.position,
                mlbam_id=args.mlbam_id,
                lookup=args.lookup,
                fetch_stats=args.fetch_stats,
                year=args.year
            )
            results.append(player)
        except Exception as e:
            logger.error(f"Failed to add player: {e}")
            sys.exit(1)

    # Output results
    output = json.dumps(results, indent=2)
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        logger.info(f"Results written to {args.output}")
    else:
        print(output)


if __name__ == '__main__':
    main()
