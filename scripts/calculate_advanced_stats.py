#!/usr/bin/env python3
"""
Calculate advanced stats from play-by-play data.

This script processes PBP data to calculate stats that aren't available from the standard API:
- Batted ball stats: GB%, LD%, FB%, HR/FB
- Pull stats: Pull%, Pull-Air% (pull percentage for fly balls and line drives)
- Plate discipline: Swing%, Contact%
- Pitching: CSW% (Called Strikes + Whiffs %)
- Handedness splits: vs L/R

Usage:
  # Calculate for a specific month (updates that month's stats file)
  python calculate_advanced_stats.py --month 2025-06

  # Calculate for the full season
  python calculate_advanced_stats.py --year 2025

  # Calculate for yesterday (for nightly runs)
  python calculate_advanced_stats.py --yesterday
"""

import argparse
import json
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Paths
DATA_DIR = Path(__file__).parent.parent / 'data'
PBP_DIR = DATA_DIR / 'pbp'
STATS_DIR = DATA_DIR / 'stats'

# Season months (April = 4 through September = 9)
SEASON_MONTHS = [4, 5, 6, 7, 8, 9]

# Batted ball classification based on result text
# Note: We can only classify outs reliably; hits could be any type
GROUNDBALL_RESULTS = {
    'Groundout', 'Bunt Groundout', 'Grounded Into DP', 'Forceout',
    'Fielders Choice', 'Fielders Choice Out', 'Double Play'
}
FLYBALL_RESULTS = {'Flyout', 'Pop Out', 'Sac Fly'}
LINEDRIVE_RESULTS = {'Lineout'}

# Patterns to detect hit direction from play descriptions
# Matches: "to left fielder", "to left field", "to left", "down the left field line"
LEFT_FIELD_PATTERN = re.compile(
    r'\bto\s+left\s+field(?:er)?\b|\bto\s+left\b|\bdown\s+the\s+left[- ]field\s+line\b',
    re.IGNORECASE
)
RIGHT_FIELD_PATTERN = re.compile(
    r'\bto\s+right\s+field(?:er)?\b|\bto\s+right\b|\bdown\s+the\s+right[- ]field\s+line\b',
    re.IGNORECASE
)
CENTER_FIELD_PATTERN = re.compile(
    r'\bto\s+center\s+field(?:er)?\b|\bto\s+center\b|\bup\s+the\s+middle\b',
    re.IGNORECASE
)

# Event types for classification
STRIKEOUT_EVENTS = {'strikeout', 'strikeout_double_play'}
WALK_EVENTS = {'walk', 'intent_walk', 'hit_by_pitch'}
HIT_EVENTS = {'single', 'double', 'triple', 'home_run'}


def parse_hit_direction(description: str) -> Optional[str]:
    """
    Parse the hit direction from a play description.

    Returns:
        'left', 'center', 'right', or None if direction can't be determined
    """
    if not description:
        return None

    # Check each pattern - order matters since we return on first match
    if LEFT_FIELD_PATTERN.search(description):
        return 'left'
    if RIGHT_FIELD_PATTERN.search(description):
        return 'right'
    if CENTER_FIELD_PATTERN.search(description):
        return 'center'

    return None


def is_pull_hit(direction: str, batter_hand: str) -> bool:
    """
    Determine if a hit was to the pull side based on batter handedness.

    - Right-handed batters pull to left field
    - Left-handed batters pull to right field
    - Switch hitters are treated based on their batting side for that at-bat
    """
    if not direction or not batter_hand:
        return False

    if batter_hand == 'R':
        return direction == 'left'
    elif batter_hand == 'L':
        return direction == 'right'
    # For switch hitters (S), we can't determine pull side without knowing
    # which side they were batting from. We'll treat them as unknown.
    return False


def classify_batted_ball(result: str, event_type: str) -> Optional[str]:
    """
    Classify a batted ball as GB, FB, LD, or None (if not classifiable).

    Returns:
        'GB' for ground ball, 'FB' for fly ball, 'LD' for line drive,
        None if can't be classified (strikeouts, walks, hits without trajectory info)
    """
    if not result:
        return None

    # Check result text for out classification
    if result in GROUNDBALL_RESULTS:
        return 'GB'
    if result in FLYBALL_RESULTS:
        return 'FB'
    if result in LINEDRIVE_RESULTS:
        return 'LD'

    # Home runs are fly balls
    if event_type == 'home_run':
        return 'FB'

    # For other hits (single, double, triple), we can't reliably classify
    # without Statcast data
    return None


def is_ball_in_play(event_type: str) -> bool:
    """Check if the at-bat resulted in a ball in play."""
    if not event_type:
        return False
    # BIP = not a strikeout, walk, or HBP
    return event_type not in STRIKEOUT_EVENTS and event_type not in WALK_EVENTS


class PlayerAdvancedStats:
    """Accumulator for player advanced stats from PBP data."""

    def __init__(self):
        # Batted ball counts (for classifiable BIP only)
        self.ground_balls = 0
        self.fly_balls = 0
        self.line_drives = 0
        self.home_runs = 0  # Subset of fly balls

        # Pull stats tracking
        # All balls in play with known direction
        self.bip_with_direction = 0
        self.pull_hits = 0
        # Fly balls, line drives, and pop-ups with known direction (for Pull-Air%)
        self.air_balls_with_direction = 0
        self.pull_air_balls = 0

        # Plate discipline (pitch-level)
        self.total_pitches = 0
        self.swings = 0  # Pitches swung at (approximation: pitches - balls)
        self.contacts = 0  # Swings that made contact (non-strikeout swings)
        self.called_strikes_whiffs = 0  # For CSW%

        # Split tracking
        self.vs_left = PlayerAdvancedStats.__new__(PlayerAdvancedStats) if not hasattr(self, '_is_split') else None
        self.vs_right = PlayerAdvancedStats.__new__(PlayerAdvancedStats) if not hasattr(self, '_is_split') else None

        # Initialize splits if this is the main object
        if self.vs_left is not None:
            self.vs_left._is_split = True
            self.vs_left._init_split()
        if self.vs_right is not None:
            self.vs_right._is_split = True
            self.vs_right._init_split()

    def _init_split(self):
        """Initialize a split accumulator (no nested splits)."""
        self.ground_balls = 0
        self.fly_balls = 0
        self.line_drives = 0
        self.home_runs = 0
        self.bip_with_direction = 0
        self.pull_hits = 0
        self.air_balls_with_direction = 0
        self.pull_air_balls = 0
        self.total_pitches = 0
        self.swings = 0
        self.contacts = 0
        self.called_strikes_whiffs = 0
        self.vs_left = None
        self.vs_right = None

    def add_at_bat(self, at_bat: dict, opponent_hand: str = None, batter_hand: str = None):
        """Process an at-bat and update stats."""
        event_type = at_bat.get('eventType', '')
        result = at_bat.get('result', '')
        description = at_bat.get('description', '')
        pitch_count = at_bat.get('pitchCount', 0)
        balls = at_bat.get('balls', 0)
        strikes = at_bat.get('strikes', 0)

        # Batted ball classification
        bb_type = classify_batted_ball(result, event_type)
        if bb_type == 'GB':
            self.ground_balls += 1
        elif bb_type == 'FB':
            self.fly_balls += 1
            if event_type == 'home_run':
                self.home_runs += 1
        elif bb_type == 'LD':
            self.line_drives += 1

        # Pull stats tracking - only for batters (not pitchers)
        # Check if this is a ball in play and we can determine direction
        if is_ball_in_play(event_type) and batter_hand and batter_hand != 'S':
            direction = parse_hit_direction(description)
            if direction:
                # Track all BIP with direction for Pull%
                self.bip_with_direction += 1
                if is_pull_hit(direction, batter_hand):
                    self.pull_hits += 1

                # Track air balls (FB + LD + Pop Out) for Pull-Air%
                # Air balls = fly balls, line drives, pop-ups (not ground balls)
                is_air_ball = bb_type in ('FB', 'LD') or result == 'Pop Out'
                # Also include hits that went to outfield (line drives and fly balls as hits)
                # We detect these by checking if the description mentions outfielders
                if is_air_ball or (event_type in HIT_EVENTS and direction in ('left', 'right', 'center')):
                    # For hits, we can infer air ball if it went to an outfielder
                    if event_type in HIT_EVENTS:
                        # Check if description mentions outfielder or indicates air ball trajectory
                        desc_lower = description.lower()
                        is_fly_hit = 'line drive' in desc_lower or 'flies' in desc_lower
                        is_to_outfielder = any(pos in desc_lower for pos in
                            ['left fielder', 'center fielder', 'right fielder'])
                        if is_fly_hit or is_to_outfielder:
                            self.air_balls_with_direction += 1
                            if is_pull_hit(direction, batter_hand):
                                self.pull_air_balls += 1
                    else:
                        # Classified outs (FB, LD, Pop Out)
                        self.air_balls_with_direction += 1
                        if is_pull_hit(direction, batter_hand):
                            self.pull_air_balls += 1

        # Pitch-level stats
        if pitch_count > 0:
            self.total_pitches += pitch_count

            # Swings approximation: total pitches - balls = potential swing pitches
            # This includes called strikes, fouls, swinging strikes, and balls in play
            swings_approx = pitch_count - balls
            self.swings += swings_approx

            # Contact approximation: if not a strikeout, they made contact on final pitch
            # Plus any fouls before that (estimated as strikes - 1 for non-K, strikes - 3 for K)
            if event_type not in STRIKEOUT_EVENTS:
                # Made contact on final swing, plus estimate prior fouls
                # Fouls = strikes seen before final contact (capped at strikes - 1)
                prior_fouls = max(0, strikes - 1) if strikes > 0 else 0
                self.contacts += 1 + prior_fouls
            else:
                # Strikeout: fouls = strikes - 3 (since strike 3 was a whiff)
                prior_fouls = max(0, strikes - 3)
                self.contacts += prior_fouls

            # CSW (Called Strikes + Whiffs) - for pitchers
            # Approximation: strikes that weren't fouls or in play
            # CSW events = strikeouts (3 whiffs or called) + walks with called strikes
            if event_type in STRIKEOUT_EVENTS:
                # At least 3 CSW events (the strikeouts)
                self.called_strikes_whiffs += 3
            elif event_type in WALK_EVENTS:
                # Walks had some called strikes
                self.called_strikes_whiffs += strikes
            else:
                # Contact plays: estimate CSW as strikes minus fouls minus 1 (for BIP)
                # Minimum 0
                csw_estimate = max(0, strikes - max(0, strikes - 1) - 1)
                self.called_strikes_whiffs += csw_estimate

        # Track splits by opponent hand
        if opponent_hand == 'L' and self.vs_left is not None:
            self.vs_left.add_at_bat(at_bat, None, batter_hand)
        elif opponent_hand == 'R' and self.vs_right is not None:
            self.vs_right.add_at_bat(at_bat, None, batter_hand)

    def get_stats(self, is_batter: bool = True) -> dict:
        """Calculate final rate stats from accumulated counts."""
        stats = {}

        # Batted ball rates (among classifiable BIP)
        classifiable_bip = self.ground_balls + self.fly_balls + self.line_drives
        if classifiable_bip >= 10:  # Minimum sample size
            stats['GB%'] = round(self.ground_balls / classifiable_bip, 3)
            stats['FB%'] = round(self.fly_balls / classifiable_bip, 3)
            stats['LD%'] = round(self.line_drives / classifiable_bip, 3)

            # HR/FB rate
            if self.fly_balls > 0:
                stats['HR/FB'] = round(self.home_runs / self.fly_balls, 3)

        # Pull stats (batters only)
        if is_batter:
            # Pull% - percentage of all BIP hit to the pull side
            if self.bip_with_direction >= 10:  # Minimum sample size
                stats['Pull%'] = round(self.pull_hits / self.bip_with_direction, 3)

            # Pull-Air% - percentage of fly balls and line drives hit to the pull side
            if self.air_balls_with_direction >= 10:  # Minimum sample size
                stats['Pull-Air%'] = round(self.pull_air_balls / self.air_balls_with_direction, 3)

        # Plate discipline
        if self.total_pitches >= 50:  # Minimum sample size
            if self.swings > 0:
                stats['Swing%'] = round(self.swings / self.total_pitches, 3)
                stats['Contact%'] = round(self.contacts / self.swings, 3) if self.swings > 0 else None

            # CSW% (primarily for pitchers)
            stats['CSW%'] = round(self.called_strikes_whiffs / self.total_pitches, 3)

        return stats

    def get_split_stats(self, is_batter: bool = True) -> dict:
        """Get stats broken down by opponent handedness."""
        splits = {}
        if self.vs_left is not None:
            vs_l = self.vs_left.get_stats(is_batter)
            if vs_l:
                splits['vsL'] = vs_l
        if self.vs_right is not None:
            vs_r = self.vs_right.get_stats(is_batter)
            if vs_r:
                splits['vsR'] = vs_r
        return splits


def load_pbp_for_month(year: int, month: int) -> list[dict]:
    """Load all PBP data for a given month."""
    month_dir = PBP_DIR / str(year) / f'{month:02d}'
    if not month_dir.exists():
        return []

    games = []
    for day_file in sorted(month_dir.glob('*.json')):
        try:
            with open(day_file) as f:
                data = json.load(f)
                games.extend(data.get('games', []))
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Error loading {day_file}: {e}")

    return games


def load_pbp_for_date(date_str: str) -> list[dict]:
    """Load PBP data for a specific date."""
    year, month, day = date_str.split('-')
    pbp_file = PBP_DIR / year / month / f'{day}.json'

    if not pbp_file.exists():
        return []

    try:
        with open(pbp_file) as f:
            data = json.load(f)
            return data.get('games', [])
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"Error loading {pbp_file}: {e}")
        return []


def process_games_for_stats(games: list[dict]) -> tuple[dict, dict, dict, dict]:
    """
    Process PBP games to calculate advanced stats for batters and pitchers.

    Returns:
        (batter_stats, pitcher_stats, batter_stats_by_level, pitcher_stats_by_level)
        - batter_stats/pitcher_stats: dicts mapping player_id to PlayerAdvancedStats (overall)
        - batter_stats_by_level/pitcher_stats_by_level: dicts mapping player_id to {level: PlayerAdvancedStats}
    """
    batter_stats: dict[str, PlayerAdvancedStats] = defaultdict(PlayerAdvancedStats)
    pitcher_stats: dict[str, PlayerAdvancedStats] = defaultdict(PlayerAdvancedStats)
    batter_stats_by_level: dict[str, dict[str, PlayerAdvancedStats]] = defaultdict(lambda: defaultdict(PlayerAdvancedStats))
    pitcher_stats_by_level: dict[str, dict[str, PlayerAdvancedStats]] = defaultdict(lambda: defaultdict(PlayerAdvancedStats))

    for game in games:
        level = game.get('level', 'MiLB')
        for at_bat in game.get('atBats', []):
            batter_id = at_bat.get('batterId')
            pitcher_id = at_bat.get('pitcherId')
            batter_hand = at_bat.get('batterHand')
            pitcher_hand = at_bat.get('pitcherHand')

            if batter_id:
                bid = str(batter_id)
                # For batters, opponent hand is the pitcher's hand
                # Pass batter_hand for pull stats calculation
                batter_stats[bid].add_at_bat(at_bat, pitcher_hand, batter_hand)
                batter_stats_by_level[bid][level].add_at_bat(at_bat, pitcher_hand, batter_hand)

            if pitcher_id:
                pid = str(pitcher_id)
                # For pitchers, opponent hand is the batter's hand
                # Don't pass batter_hand (no pull stats for pitchers)
                pitcher_stats[pid].add_at_bat(at_bat, batter_hand, None)
                pitcher_stats_by_level[pid][level].add_at_bat(at_bat, batter_hand, None)

    return dict(batter_stats), dict(pitcher_stats), dict(batter_stats_by_level), dict(pitcher_stats_by_level)


def load_monthly_stats(year: int, month: int) -> dict:
    """Load existing monthly stats file."""
    month_file = STATS_DIR / str(year) / f'{month:02d}.json'
    if month_file.exists():
        with open(month_file) as f:
            return json.load(f)
    return {
        'year': year,
        'month': month,
        'updated': datetime.now().isoformat(),
        'players': {},
    }


def save_monthly_stats(data: dict, year: int, month: int) -> None:
    """Save monthly stats file."""
    year_dir = STATS_DIR / str(year)
    year_dir.mkdir(parents=True, exist_ok=True)

    data['updated'] = datetime.now().isoformat()

    month_file = year_dir / f'{month:02d}.json'
    with open(month_file, 'w') as f:
        json.dump(data, f, separators=(',', ':'))

    logger.info(f"Saved stats to {month_file}")


def update_player_advanced_stats(player_data: dict, adv_stats: dict, splits: dict, stat_type: str,
                                  level_stats: dict[str, dict] = None) -> None:
    """Update a player's data with advanced stats, splits, and per-level PBP stats."""
    # Get the appropriate stats dict (batting or pitching)
    stats_key = 'batting' if stat_type == 'batting' else 'pitching'

    if stats_key not in player_data:
        player_data[stats_key] = {}

    # Add advanced stats to the main stats
    for key, value in adv_stats.items():
        if value is not None:
            player_data[stats_key][key] = value

    # Add handedness splits
    if splits:
        splits_key = f'{stats_key}Splits'
        if splits_key not in player_data:
            player_data[splits_key] = {}

        for split_name, split_stats in splits.items():
            if split_stats:
                player_data[splits_key][split_name] = split_stats

    # Add per-level PBP stats
    if level_stats:
        by_level_key = f'{stats_key}ByLevel'
        if by_level_key not in player_data:
            player_data[by_level_key] = {}

        for level, lstats in level_stats.items():
            if level not in player_data[by_level_key]:
                player_data[by_level_key][level] = {}
            for key, value in lstats.items():
                if value is not None:
                    player_data[by_level_key][level][key] = value


def calculate_for_month(year: int, month: int) -> int:
    """
    Calculate advanced stats for a specific month.

    Returns number of players updated.
    """
    logger.info(f"Calculating advanced stats for {year}-{month:02d}")

    # Load PBP data for the month
    games = load_pbp_for_month(year, month)
    if not games:
        logger.info(f"No PBP data found for {year}-{month:02d}")
        return 0

    logger.info(f"Processing {len(games)} games")

    # Calculate stats from PBP
    batter_stats, pitcher_stats, batter_by_level, pitcher_by_level = process_games_for_stats(games)

    # Load existing monthly stats
    monthly_data = load_monthly_stats(year, month)
    players = monthly_data.get('players', {})

    updated_count = 0

    # Update batters
    for player_id, stats_acc in batter_stats.items():
        adv_stats = stats_acc.get_stats(is_batter=True)
        splits = stats_acc.get_split_stats(is_batter=True)

        # Build per-level stats
        level_stats = {}
        if player_id in batter_by_level:
            for level, level_acc in batter_by_level[player_id].items():
                level_adv = level_acc.get_stats(is_batter=True)
                if level_adv:
                    level_stats[level] = level_adv

        if player_id in players:
            update_player_advanced_stats(players[player_id], adv_stats, splits, 'batting', level_stats)
            updated_count += 1
        # Note: We only update existing players, not create new ones
        # New players come from fetch_stats_by_date.py

    # Update pitchers
    for player_id, stats_acc in pitcher_stats.items():
        adv_stats = stats_acc.get_stats(is_batter=False)
        splits = stats_acc.get_split_stats(is_batter=False)

        # Build per-level stats
        level_stats = {}
        if player_id in pitcher_by_level:
            for level, level_acc in pitcher_by_level[player_id].items():
                level_adv = level_acc.get_stats(is_batter=False)
                if level_adv:
                    level_stats[level] = level_adv

        if player_id in players:
            update_player_advanced_stats(players[player_id], adv_stats, splits, 'pitching', level_stats)
            updated_count += 1

    # Save updated stats
    monthly_data['players'] = players
    save_monthly_stats(monthly_data, year, month)

    logger.info(f"Updated {updated_count} players with advanced stats")
    return updated_count


def calculate_for_date(date_str: str) -> int:
    """
    Calculate advanced stats for a specific date.
    Updates the corresponding month's stats file.

    Returns number of players updated.
    """
    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
    year = date_obj.year
    month = date_obj.month

    logger.info(f"Calculating advanced stats for {date_str}")

    # For a single date, we need to recalculate the whole month
    # to get accurate cumulative stats
    return calculate_for_month(year, month)


def calculate_for_year(year: int) -> int:
    """
    Calculate advanced stats for a full season.

    Returns total number of player-months updated.
    """
    logger.info(f"Calculating advanced stats for {year} season")

    total_updated = 0
    for month in SEASON_MONTHS:
        updated = calculate_for_month(year, month)
        total_updated += updated

    return total_updated


def main():
    parser = argparse.ArgumentParser(
        description='Calculate advanced stats from play-by-play data'
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--month', type=str,
                       help='Calculate for specific month (YYYY-MM)')
    group.add_argument('--year', type=int,
                       help='Calculate for full season')
    group.add_argument('--yesterday', action='store_true',
                       help='Calculate for yesterday (recalculates that month)')
    group.add_argument('--date', type=str,
                       help='Calculate for specific date (YYYY-MM-DD)')

    parser.add_argument('--debug', action='store_true',
                        help='Enable debug logging')

    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.month:
        year, month = map(int, args.month.split('-'))
        calculate_for_month(year, month)

    elif args.year:
        calculate_for_year(args.year)

    elif args.yesterday:
        yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        calculate_for_date(yesterday)

    elif args.date:
        calculate_for_date(args.date)

    logger.info("Complete!")


if __name__ == '__main__':
    main()
