#!/usr/bin/env python3
"""
scripts/search_players.py
Search for MiLB players using the MLB Stats API.
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

from mlbstatsapi import Mlb

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Paths
DATA_DIR = Path(__file__).parent.parent / 'data'
INDEX_FILE = DATA_DIR / 'player-index.json'

# MiLB levels and their MLB Stats API sport IDs
MILB_LEVELS = {
    'AAA': 11,
    'AA': 12,
    'A+': 13,
    'A': 14,
    'CPX': 16,
}

SPORT_ID_TO_LEVEL = {v: k for k, v in MILB_LEVELS.items()}


def search_player_by_name(mlb: Mlb, name: str, sport_id: int = None) -> list[dict]:
    """
    Search for a player by name using MLB Stats API.

    Args:
        mlb: MLB API client
        name: Player name to search for
        sport_id: Optional sport ID to limit search (default: search all MiLB)

    Returns:
        List of matching players with their IDs and info
    """
    results = []

    try:
        # Use the API's people ID lookup
        player_ids = mlb.get_people_id(name)

        if not player_ids:
            logger.info(f"No players found matching: {name}")
            return results

        for player_id in player_ids:
            try:
                person = mlb.get_person(player_id)
                if person:
                    player = {
                        'mlbId': str(player_id),
                        'name': person.fullname if hasattr(person, 'fullname') else str(person),
                        'position': '',
                        'team': '',
                        'level': '',
                    }

                    # Get position
                    if hasattr(person, 'primaryposition') and person.primaryposition:
                        player['position'] = person.primaryposition.abbreviation or 'UTIL'

                    # Get current team info if available
                    if hasattr(person, 'currentteam') and person.currentteam:
                        player['team'] = person.currentteam.name or ''

                    results.append(player)
            except Exception as e:
                logger.debug(f"Failed to get person {player_id}: {e}")

    except Exception as e:
        logger.warning(f"Player search failed: {e}")

    return results


def search_index(name: str = None, team: str = None, level: str = None, position: str = None) -> list[dict]:
    """
    Search the local player index for matching players.

    This is faster than API calls when searching within tracked players.
    """
    if not INDEX_FILE.exists():
        logger.warning("Player index not found. Run build_player_index.py first.")
        return []

    with open(INDEX_FILE) as f:
        data = json.load(f)

    players = data.get('players', [])
    results = []

    for player in players:
        # Apply filters
        if name:
            player_name = player.get('name', '').lower()
            if name.lower() not in player_name:
                continue

        if team:
            player_team = player.get('team', '').lower()
            player_org = player.get('org', '').lower()
            if team.lower() not in player_team and team.lower() not in player_org:
                continue

        if level:
            if player.get('level', '').upper() != level.upper():
                continue

        if position:
            if player.get('position', '').upper() != position.upper():
                continue

        results.append(player)

    return results


def get_players_by_team(mlb: Mlb, team_name: str, year: int = None) -> list[dict]:
    """Get all players for a specific team."""
    if year is None:
        year = datetime.now().year

    results = []

    try:
        # Try to find the team
        team_id = mlb.get_team_id(team_name)
        if not team_id:
            logger.warning(f"Team not found: {team_name}")
            return results

        # Get roster
        roster = mlb.get_team_roster(team_id[0], season=year)

        if roster:
            for player in roster:
                player_id = player.id if hasattr(player, 'id') else None
                if not player_id:
                    continue

                full_name = player.fullname if hasattr(player, 'fullname') else ''
                if not full_name:
                    full_name = player.full_name if hasattr(player, 'full_name') else ''

                pos = 'UTIL'
                if hasattr(player, 'primaryposition') and player.primaryposition:
                    pos = player.primaryposition.abbreviation or 'UTIL'

                results.append({
                    'mlbId': str(player_id),
                    'name': full_name,
                    'team': team_name,
                    'position': pos,
                })

    except Exception as e:
        logger.warning(f"Failed to get team roster: {e}")

    return results


def get_players_by_level(mlb: Mlb, level: str, year: int = None) -> list[dict]:
    """Get all players for a specific MiLB level."""
    if year is None:
        year = datetime.now().year

    if level not in MILB_LEVELS:
        logger.error(f"Invalid level: {level}. Must be one of {list(MILB_LEVELS.keys())}")
        return []

    sport_id = MILB_LEVELS[level]
    results = []

    try:
        teams = mlb.get_teams(sport_id=sport_id, season=year)

        if not teams:
            logger.warning(f"No teams found for {level}")
            return results

        for team in teams:
            team_id = team.id
            team_name = team.name or 'Unknown'

            # Get parent org
            parent_org = ''
            if hasattr(team, 'parent_org_name') and team.parent_org_name:
                parent_org = team.parent_org_name[:3].upper()

            try:
                roster = mlb.get_team_roster(team_id, season=year)
                if not roster:
                    continue

                for player in roster:
                    player_id = player.id if hasattr(player, 'id') else None
                    if not player_id:
                        continue

                    full_name = player.fullname if hasattr(player, 'fullname') else ''
                    if not full_name:
                        full_name = player.full_name if hasattr(player, 'full_name') else ''

                    pos = 'UTIL'
                    if hasattr(player, 'primaryposition') and player.primaryposition:
                        pos = player.primaryposition.abbreviation or 'UTIL'

                    results.append({
                        'mlbId': str(player_id),
                        'name': full_name,
                        'team': team_name,
                        'org': parent_org,
                        'level': level,
                        'position': pos,
                        'type': 'pitcher' if pos == 'P' else 'batter',
                    })

            except Exception as e:
                logger.debug(f"Failed to get roster for {team_name}: {e}")

    except Exception as e:
        logger.warning(f"Failed to get teams for {level}: {e}")

    return results


def main():
    parser = argparse.ArgumentParser(description='Search for MiLB players')
    parser.add_argument('--name', type=str, help='Player name to search for')
    parser.add_argument('--team', type=str, help='Team name to filter by')
    parser.add_argument('--level', type=str, choices=['AAA', 'AA', 'A+', 'A', 'CPX'],
                        help='MiLB level to search')
    parser.add_argument('--position', type=str, help='Position to filter by')
    parser.add_argument('--year', type=int, default=datetime.now().year,
                        help='Season year')
    parser.add_argument('--use-api', action='store_true',
                        help='Search via API instead of local index')
    parser.add_argument('--output', type=str, help='Output file path (default: stdout)')
    parser.add_argument('--format', choices=['json', 'table'], default='json',
                        help='Output format')

    args = parser.parse_args()

    if not args.name and not args.team and not args.level:
        parser.error("At least one of --name, --team, or --level is required")

    results = []

    if args.use_api:
        # Search via MLB Stats API
        mlb = Mlb()

        if args.name:
            results = search_player_by_name(mlb, args.name)
        elif args.team:
            results = get_players_by_team(mlb, args.team, args.year)
        elif args.level:
            results = get_players_by_level(mlb, args.level, args.year)

        # Apply additional filters
        if args.name and (args.team or args.level):
            name_lower = args.name.lower()
            results = [r for r in results if name_lower in r.get('name', '').lower()]

        if args.team and args.level:
            team_lower = args.team.lower()
            results = [r for r in results if team_lower in r.get('team', '').lower()]

        if args.position:
            pos_upper = args.position.upper()
            results = [r for r in results if r.get('position', '').upper() == pos_upper]

    else:
        # Search local index
        results = search_index(
            name=args.name,
            team=args.team,
            level=args.level,
            position=args.position
        )

    # Deduplicate by mlbId
    seen = set()
    unique_results = []
    for player in results:
        pid = player.get('mlbId', player.get('fangraphsId', ''))
        if pid and pid not in seen:
            seen.add(pid)
            unique_results.append(player)
    results = unique_results

    logger.info(f"Found {len(results)} players")

    # Output results
    if args.format == 'json':
        output = json.dumps(results, indent=2)
    else:
        # Table format
        if results:
            header = ['mlbId', 'name', 'team', 'level', 'position']
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
