#!/usr/bin/env python3
"""
Fetch MiLB Statcast data from Baseball Savant for AAA and Florida State League games.

Note: MiLB Statcast data is only available for:
  - All Triple-A (AAA) games (since 2023)
  - Florida State League (Single-A) games

This script fetches pitch-level data from Baseball Savant's minor league search
and aggregates it into player-level Statcast metrics.

Data is stored in monthly files to avoid GitHub's file size limits:
  data/statcast/{year}/{month}.json  - Player data for that month
  data/statcast/{year}/manifest.json - Lists available months
"""

import argparse
import csv
import io
import json
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / 'data'
STATCAST_DIR = DATA_DIR / 'statcast'
STATS_DIR = DATA_DIR / 'stats'

# Baseball Savant endpoints (minors uses hyphens, MLB uses underscore)
SAVANT_MINORS_URL = 'https://baseballsavant.mlb.com/statcast-search-minors/csv'

# Request settings - following sabRmetrics chunking approach
REQUEST_TIMEOUT = 120  # 2 minutes per chunk (chunks are smaller now)
MAX_RETRIES = 3
RETRY_DELAY = 5
CHUNK_DAYS = 5  # Split date ranges into 5-day chunks (sabRmetrics strategy)
ROW_LIMIT_WARNING = 25000  # Baseball Savant returns max 25,000 rows per query

# Known CSV column names to detect valid responses
VALID_CSV_COLUMNS = ['pitch_type', 'release_speed', 'batter', 'pitcher', 'game_date', 'launch_speed']

# Season months (April = 4 through September = 9)
SEASON_MONTHS = [4, 5, 6, 7, 8, 9]


def generate_date_chunks(start_date: datetime, end_date: datetime, chunk_days: int = CHUNK_DAYS) -> list[tuple[str, str]]:
    """
    Split a date range into smaller chunks (sabRmetrics strategy).

    This helps avoid:
    1. Timeouts on large date ranges
    2. Hitting Baseball Savant's 25,000 row limit per query

    Args:
        start_date: Start of the date range
        end_date: End of the date range
        chunk_days: Number of days per chunk (default: 5)

    Returns:
        List of (start_date_str, end_date_str) tuples
    """
    chunks = []
    current = start_date

    while current <= end_date:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end_date)
        chunks.append((
            current.strftime('%Y-%m-%d'),
            chunk_end.strftime('%Y-%m-%d'),
        ))
        current = chunk_end + timedelta(days=1)

    return chunks


def get_session() -> requests.Session:
    """Create a session with appropriate headers.

    Following pybaseball's approach with minimal headers.
    Baseball Savant's API is generally permissive.
    """
    session = requests.Session()
    # Use a standard browser User-Agent to avoid bot detection
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    return session


def fetch_statcast_csv(
    session: requests.Session,
    year: int,
    start_date: str,
    end_date: str,
    player_type: str = 'batter',
    level: str = 'aaa',
) -> Optional[str]:
    """
    Fetch Statcast CSV data from Baseball Savant minor league search.

    Args:
        session: Requests session
        year: Season year
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        player_type: 'batter' or 'pitcher'
        level: 'aaa' for Triple-A or 'a' for Single-A (FSL)

    Returns:
        CSV data as string, or None if request failed
    """
    # Parameters aligned with pybaseball's statcast query format
    # Reference: https://github.com/jldbc/pybaseball/blob/master/docs/statcast.md
    params = {
        'all': 'true',
        'hfPT': '',
        'hfAB': '',
        'hfBBT': '',
        'hfPR': '',
        'hfZ': '',
        'stadium': '',
        'hfBBL': '',
        'hfNewZones': '',
        'hfGT': 'R|',  # R=Regular season (pybaseball uses R|PO|S| but we only need regular)
        'hfSea': f'{year}|',
        'hfSit': '',
        'player_type': player_type,
        'hfOuts': '',
        'opponent': '',
        'pitcher_throws': '',
        'batter_stands': '',
        'hfSA': '',
        'game_date_gt': start_date,
        'game_date_lt': end_date,
        'hfMo': '',
        'team': '',
        'position': '',
        'hfRO': '',
        'home_road': '',
        'hfFlag': '',
        'metric_1': '',
        'hfInn': '',
        'min_pitches': '0',
        'min_results': '0',
        'min_abs': '0',
        'group_by': 'name',
        'sort_col': 'pitches',
        'player_event_sort': 'h_launch_speed',
        'sort_order': 'desc',
        'type': 'details',
    }

    # Add level filter for minors endpoint
    if level == 'aaa':
        params['hfLevel'] = 'AAA|'
    elif level == 'a':
        params['hfLevel'] = 'A|'

    for attempt in range(MAX_RETRIES):
        try:
            logger.debug(f"Fetching {player_type} data for {level.upper()} ({start_date} to {end_date})...")
            logger.debug(f"URL: {SAVANT_MINORS_URL}")
            resp = session.get(SAVANT_MINORS_URL, params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()

            content = resp.text
            content_lower = content.lower()

            # Log response details for debugging
            logger.debug(f"Response status: {resp.status_code}, Content length: {len(content)}")
            if len(content) < 500:
                logger.debug(f"Full response: {content}")
            else:
                logger.debug(f"First 500 chars: {content[:500]}")

            # Check if response is valid CSV with expected columns
            has_valid_columns = any(col in content_lower for col in VALID_CSV_COLUMNS)

            if content and len(content) > 100 and has_valid_columns:
                logger.info(f"Successfully fetched {len(content)} bytes of data")
                return content
            elif 'no results' in content_lower or 'error' in content_lower or len(content) < 100:
                logger.debug(f"No data returned for {level.upper()} {player_type}: {content[:200] if content else 'empty'}")
                return None
            else:
                # Return content anyway - might still be valid CSV with different columns
                logger.warning(f"Unexpected response format for {level.upper()} {player_type}, returning anyway")
                logger.warning(f"Content preview: {content[:300]}")
                return content

        except requests.exceptions.RequestException as e:
            logger.warning(f"Request failed (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))

    logger.error(f"Failed to fetch data after {MAX_RETRIES} attempts")
    return None


def parse_statcast_csv(csv_data: str) -> list[dict]:
    """Parse Statcast CSV data into list of pitch records."""
    if not csv_data:
        return []

    records = []
    try:
        reader = csv.DictReader(io.StringIO(csv_data))
        for row in reader:
            records.append(row)
    except Exception as e:
        logger.warning(f"Error parsing CSV: {e}")

    return records


def safe_float(val) -> Optional[float]:
    """Safely convert value to float."""
    if val is None or val == '' or val == 'null':
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def safe_int(val) -> Optional[int]:
    """Safely convert value to int."""
    if val is None or val == '' or val == 'null':
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def aggregate_batter_statcast(records: list[dict]) -> dict:
    """
    Aggregate pitch-level records into batter Statcast metrics.

    Metrics calculated:
    - EV (Exit Velocity): Average launch_speed on batted balls
    - LA (Launch Angle): Average launch_angle on batted balls
    - Barrel%: Barrels / Batted Ball Events
    - Hard%: Hard hit balls (95+ mph) / Batted Ball Events
    - GB%, FB%, LD%: Ground ball, fly ball, line drive rates
    - xBA, xSLG, xwOBA: Expected stats based on batted ball quality
    """
    batted_balls = []
    total_pitches = 0
    swings = 0
    whiffs = 0

    for rec in records:
        total_pitches += 1

        desc = rec.get('description', '').lower()
        if 'swing' in desc or 'foul' in desc or 'hit_into_play' in desc.lower():
            swings += 1
            if 'swinging_strike' in desc or 'missed' in desc:
                whiffs += 1

        ev = safe_float(rec.get('launch_speed'))
        la = safe_float(rec.get('launch_angle'))

        if ev is not None and la is not None:
            batted_balls.append({
                'ev': ev,
                'la': la,
                'barrel': rec.get('barrel', '0') == '1',
                'bb_type': rec.get('bb_type', ''),
                'xba': safe_float(rec.get('estimated_ba_using_speedangle')),
                'xslg': safe_float(rec.get('estimated_slg_using_speedangle')),
                'xwoba': safe_float(rec.get('estimated_woba_using_speedangle')),
            })

    if not batted_balls:
        return {}

    total_bbe = len(batted_balls)

    result = {
        'BBE': total_bbe,
        'Pitches': total_pitches,
    }

    evs = [bb['ev'] for bb in batted_balls if bb['ev'] is not None]
    if evs:
        result['EV'] = round(sum(evs) / len(evs), 1)
        result['maxEV'] = round(max(evs), 1)

    las = [bb['la'] for bb in batted_balls if bb['la'] is not None]
    if las:
        result['LA'] = round(sum(las) / len(las), 1)

    barrels = sum(1 for bb in batted_balls if bb['barrel'])
    result['Barrel%'] = round(barrels / total_bbe * 100, 1) if total_bbe > 0 else 0
    result['Barrels'] = barrels

    hard_hits = sum(1 for bb in batted_balls if bb['ev'] and bb['ev'] >= 95)
    result['Hard%'] = round(hard_hits / total_bbe * 100, 1) if total_bbe > 0 else 0

    gb_count = sum(1 for bb in batted_balls if bb['bb_type'] == 'ground_ball')
    fb_count = sum(1 for bb in batted_balls if bb['bb_type'] == 'fly_ball')
    ld_count = sum(1 for bb in batted_balls if bb['bb_type'] == 'line_drive')
    popup_count = sum(1 for bb in batted_balls if bb['bb_type'] == 'popup')

    result['GB%'] = round(gb_count / total_bbe * 100, 1) if total_bbe > 0 else 0
    result['FB%'] = round(fb_count / total_bbe * 100, 1) if total_bbe > 0 else 0
    result['LD%'] = round(ld_count / total_bbe * 100, 1) if total_bbe > 0 else 0
    result['PU%'] = round(popup_count / total_bbe * 100, 1) if total_bbe > 0 else 0

    xbas = [bb['xba'] for bb in batted_balls if bb['xba'] is not None]
    xslgs = [bb['xslg'] for bb in batted_balls if bb['xslg'] is not None]
    xwobas = [bb['xwoba'] for bb in batted_balls if bb['xwoba'] is not None]

    if xbas:
        result['xBA'] = round(sum(xbas) / len(xbas), 3)
    if xslgs:
        result['xSLG'] = round(sum(xslgs) / len(xslgs), 3)
    if xwobas:
        result['xwOBA'] = round(sum(xwobas) / len(xwobas), 3)

    if swings > 0:
        result['Whiff%'] = round(whiffs / swings * 100, 1)

    return result


def aggregate_pitcher_statcast(records: list[dict]) -> dict:
    """
    Aggregate pitch-level records into pitcher Statcast metrics.

    Metrics calculated:
    - Velo: Average fastball velocity
    - SpinRate: Average spin rate
    - Whiff%: Swinging strikes / swings
    - CSW%: Called strikes + whiffs / total pitches
    """
    pitch_data = defaultdict(list)
    total_pitches = 0
    called_strikes = 0
    swinging_strikes = 0
    swings = 0

    for rec in records:
        total_pitches += 1

        pitch_type = rec.get('pitch_type', 'UN')
        velo = safe_float(rec.get('release_speed'))
        spin = safe_float(rec.get('release_spin_rate'))

        if velo is not None:
            pitch_data[pitch_type].append({
                'velo': velo,
                'spin': spin,
            })

        desc = rec.get('description', '').lower()
        if 'called_strike' in desc:
            called_strikes += 1
        if 'swinging_strike' in desc or 'missed' in desc:
            swinging_strikes += 1
        if 'swing' in desc or 'foul' in desc or 'hit_into_play' in desc.lower():
            swings += 1

    if total_pitches == 0:
        return {}

    result = {
        'Pitches': total_pitches,
    }

    fastball_types = ['FF', 'SI', 'FC', 'FT']
    fastball_velos = []
    for pt in fastball_types:
        if pt in pitch_data:
            fastball_velos.extend([p['velo'] for p in pitch_data[pt] if p['velo'] is not None])

    if fastball_velos:
        result['Velo'] = round(sum(fastball_velos) / len(fastball_velos), 1)
        result['maxVelo'] = round(max(fastball_velos), 1)

    all_spins = []
    for pt, pitches in pitch_data.items():
        for p in pitches:
            if p['spin'] is not None:
                all_spins.append(p['spin'])

    if all_spins:
        result['SpinRate'] = round(sum(all_spins) / len(all_spins))

    if swings > 0:
        result['Whiff%'] = round(swinging_strikes / swings * 100, 1)

    csw = called_strikes + swinging_strikes
    result['CSW%'] = round(csw / total_pitches * 100, 1) if total_pitches > 0 else 0

    # Pitch mix (compact format to reduce file size)
    pitch_mix = {}
    for pt, pitches in pitch_data.items():
        if len(pitches) >= 5:
            velos = [p['velo'] for p in pitches if p['velo'] is not None]
            spins = [p['spin'] for p in pitches if p['spin'] is not None]

            pitch_info = {
                'n': len(pitches),
                'pct': round(len(pitches) / total_pitches * 100, 1),
            }

            if velos:
                pitch_info['v'] = round(sum(velos) / len(velos), 1)
            if spins:
                pitch_info['s'] = round(sum(spins) / len(spins))

            pitch_mix[pt] = pitch_info

    if pitch_mix:
        result['mix'] = pitch_mix

    return result


def process_statcast_data(
    batter_records: list[dict],
    pitcher_records: list[dict],
    level: str,
) -> dict:
    """
    Process raw Statcast records into player-level aggregations.

    Returns dict mapping player_id -> statcast metrics
    """
    players = {}

    # Group batter records by player
    batter_by_player = defaultdict(list)
    for rec in batter_records:
        player_id = rec.get('batter')
        if player_id:
            batter_by_player[player_id].append(rec)

    for player_id, records in batter_by_player.items():
        if len(records) >= 10:
            player_name = records[0].get('player_name', '')
            stats = aggregate_batter_statcast(records)
            if stats:
                players[player_id] = {
                    'id': player_id,
                    'name': player_name,
                    'type': 'batter',
                    'level': level,
                    'bat': stats,
                }

    # Group pitcher records by player
    pitcher_by_player = defaultdict(list)
    for rec in pitcher_records:
        player_id = rec.get('pitcher')
        if player_id:
            pitcher_by_player[player_id].append(rec)

    for player_id, records in pitcher_by_player.items():
        if len(records) >= 50:
            player_name = records[0].get('player_name', '')
            stats = aggregate_pitcher_statcast(records)
            if stats:
                if player_id in players:
                    players[player_id]['pit'] = stats
                    if stats.get('Pitches', 0) > players[player_id].get('bat', {}).get('BBE', 0) * 3:
                        players[player_id]['type'] = 'pitcher'
                else:
                    players[player_id] = {
                        'id': player_id,
                        'name': player_name,
                        'type': 'pitcher',
                        'level': level,
                        'pit': stats,
                    }

    return players


def fetch_chunked_statcast(
    session: requests.Session,
    year: int,
    start_date: datetime,
    end_date: datetime,
    player_type: str,
    level: str,
) -> list[dict]:
    """
    Fetch Statcast data using 5-day chunks (sabRmetrics strategy).

    This approach:
    1. Splits date range into 5-day chunks
    2. Fetches each chunk with retries
    3. Warns if any chunk hits the 25,000 row limit
    4. Combines all data

    Args:
        session: Requests session
        year: Season year
        start_date: Start of the date range
        end_date: End of the date range
        player_type: 'batter' or 'pitcher'
        level: 'aaa' for Triple-A or 'a' for Single-A

    Returns:
        Combined list of all records from all chunks
    """
    chunks = generate_date_chunks(start_date, end_date)
    n_chunks = len(chunks)
    level_name = 'AAA' if level == 'aaa' else 'A'

    logger.info(f"    Downloading {n_chunks} chunk(s) ({CHUNK_DAYS}-day periods) for {level_name} {player_type}s...")

    all_records = []
    chunks_at_limit = 0

    for i, (chunk_start, chunk_end) in enumerate(chunks, 1):
        logger.debug(f"      Chunk {i}/{n_chunks}: {chunk_start} to {chunk_end}")

        csv_data = fetch_statcast_csv(session, year, chunk_start, chunk_end, player_type, level)
        records = parse_statcast_csv(csv_data) if csv_data else []

        if records:
            all_records.extend(records)
            logger.debug(f"        ✓ {len(records)} rows")

            # Check for row limit (data may be truncated)
            if len(records) == ROW_LIMIT_WARNING:
                chunks_at_limit += 1
                logger.warning(f"        ⚠ Chunk {i} returned exactly {ROW_LIMIT_WARNING} rows - data may be truncated")
        else:
            logger.debug(f"        • No data (likely no games)")

        # Rate limiting between chunks
        if i < n_chunks:
            time.sleep(1)

    if chunks_at_limit > 0:
        logger.warning(f"    ⚠ {chunks_at_limit} chunk(s) returned exactly {ROW_LIMIT_WARNING} rows. Data may be missing.")

    logger.info(f"    ✓ Total {level_name} {player_type} rows: {len(all_records)}")
    return all_records


def fetch_month_statcast(
    session: requests.Session,
    year: int,
    month: int,
) -> dict:
    """Fetch Statcast data for a specific month using 5-day chunking."""
    # Calculate month date range
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = datetime(year, month + 1, 1) - timedelta(days=1)

    # Don't fetch future dates
    today = datetime.now()
    if start_date > today:
        return {}
    if end_date > today:
        end_date = today

    all_players = {}

    # Fetch for each supported level
    for level in ['aaa', 'a']:  # AAA and Single-A (FSL)
        level_name = 'Triple-A' if level == 'aaa' else 'Single-A (FSL)'
        logger.info(f"  Fetching {level_name} data (using {CHUNK_DAYS}-day chunks)...")

        # Fetch batter data with chunking
        batter_records = fetch_chunked_statcast(session, year, start_date, end_date, 'batter', level)

        time.sleep(2)

        # Fetch pitcher data with chunking
        pitcher_records = fetch_chunked_statcast(session, year, start_date, end_date, 'pitcher', level)

        # Process into player aggregations
        level_players = process_statcast_data(batter_records, pitcher_records, level.upper())
        logger.info(f"    Players with sufficient data: {len(level_players)}")

        # Merge into all_players
        for player_id, player_data in level_players.items():
            if player_id in all_players:
                existing = all_players[player_id]
                if 'bat' in player_data and 'bat' not in existing:
                    existing['bat'] = player_data['bat']
                if 'pit' in player_data and 'pit' not in existing:
                    existing['pit'] = player_data['pit']
            else:
                all_players[player_id] = player_data

        time.sleep(3)

    return all_players


def save_month_data(year: int, month: int, players: dict) -> None:
    """Save monthly Statcast data to file."""
    year_dir = STATCAST_DIR / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)

    month_file = year_dir / f'{month:02d}.json'

    output = {
        'year': year,
        'month': month,
        'updated': datetime.now().isoformat(),
        'players': players,
    }

    with open(month_file, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    logger.info(f"Saved {len(players)} players to {month_file}")


def update_manifest(year: int, months: list[int]) -> None:
    """Update the year's manifest file."""
    year_dir = STATCAST_DIR / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)

    manifest_file = year_dir / 'manifest.json'

    manifest = {
        'year': year,
        'updated': datetime.now().isoformat(),
        'months': sorted(months),
        'coverage': {
            'AAA': 'All Triple-A games',
            'A': 'Florida State League (Single-A)',
        },
    }

    with open(manifest_file, 'w') as f:
        json.dump(manifest, f, indent=2)

    logger.info(f"Updated manifest: {manifest_file}")


def main():
    parser = argparse.ArgumentParser(description='Fetch MiLB Statcast data from Baseball Savant')
    parser.add_argument('--year', type=int, default=datetime.now().year)
    parser.add_argument('--month', type=int, default=None,
                        help='Specific month to fetch (default: current or all)')
    parser.add_argument('--all-months', action='store_true',
                        help='Fetch all season months (April-September)')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info(f"Fetching {args.year} MiLB Statcast data...")
    logger.info("Note: Statcast data is only available for AAA and Florida State League games")

    session = get_session()
    months_fetched = []

    if args.month:
        # Fetch specific month
        months_to_fetch = [args.month]
    elif args.all_months:
        # Fetch all season months
        months_to_fetch = SEASON_MONTHS
    else:
        # Fetch current month only
        current_month = datetime.now().month
        if current_month in SEASON_MONTHS:
            months_to_fetch = [current_month]
        else:
            logger.info(f"Month {current_month} is outside season (April-September)")
            months_to_fetch = []

    for month in months_to_fetch:
        month_name = datetime(args.year, month, 1).strftime('%B')
        logger.info(f"\nFetching {month_name} {args.year}...")

        try:
            players = fetch_month_statcast(session, args.year, month)

            if players:
                save_month_data(args.year, month, players)
                months_fetched.append(month)
            else:
                logger.info(f"No data available for {month_name}")

        except Exception as e:
            logger.error(f"Error fetching {month_name}: {e}")
            if args.debug:
                raise

        time.sleep(5)  # Rate limiting between months

    # Update manifest with all available months
    if months_fetched:
        # Check for existing months
        year_dir = STATCAST_DIR / str(args.year)
        if year_dir.exists():
            existing_months = [
                int(f.stem) for f in year_dir.glob('*.json')
                if f.stem.isdigit()
            ]
            all_months = sorted(set(existing_months + months_fetched))
        else:
            all_months = months_fetched

        update_manifest(args.year, all_months)

    total_players = sum(
        len(json.load(open(STATCAST_DIR / str(args.year) / f'{m:02d}.json')).get('players', {}))
        for m in months_fetched
        if (STATCAST_DIR / str(args.year) / f'{m:02d}.json').exists()
    ) if months_fetched else 0

    logger.info(f"\nComplete! Fetched {len(months_fetched)} months, ~{total_players} player-months of data")


if __name__ == '__main__':
    main()
