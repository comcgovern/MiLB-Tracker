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

# ============================================================================
# Pitch call code reference table
# ============================================================================
# MLB Stats API pitch call codes from details.call.code:
#
# Code | Description          | Ball? | Strike? | Swing? | Contact? | CSW?
# -----|----------------------|-------|---------|--------|----------|-----
#  B   | Ball                 |  Yes  |   No    |   No   |    No    |  No
#  C   | Called Strike         |  No   |   Yes   |   No   |    No    | Yes
#  S   | Swinging Strike      |  No   |   Yes   |  Yes   |    No    | Yes
#  F   | Foul                 |  No   |   Yes   |  Yes   |   Yes    |  No
#  T   | Foul Tip             |  No   |   Yes   |  Yes   |   Yes    |  No
#  L   | Foul Bunt            |  No   |   Yes   |  Yes   |   Yes    |  No
#  M   | Missed Bunt          |  No   |   Yes   |  Yes   |    No    | Yes
#  W   | Swinging Strike (Blocked) | No | Yes   |  Yes   |    No    | Yes
#  I   | Intentional Ball     |  Yes  |   No    |   No   |    No    |  No
#  P   | Pitchout             |  Yes  |   No    |   No   |    No    |  No
#  V   | Automatic Ball       |  Yes  |   No    |   No   |    No    |  No
#  X   | In Play, Out(s)      |  No   |   No    |  Yes   |   Yes    |  No
#  D   | In Play, No Out      |  No   |   No    |  Yes   |   Yes    |  No
#  E   | In Play, Run(s)      |  No   |   No    |  Yes   |   Yes    |  No
#  H   | Hit By Pitch         |  No   |   No    |   No   |    No    |  No
#  O   | Foul Pitchout        |  No   |   Yes   |  Yes   |   Yes    |  No
#  Q   | Swinging Pitchout    |  No   |   Yes   |  Yes   |    No    | Yes
#  R   | Foul Tip (Bunt)      |  No   |   Yes   |  Yes   |   Yes    |  No
# ============================================================================

# Pitch codes that count as swings (batter offered at the pitch)
SWING_CODES = {'S', 'F', 'T', 'L', 'M', 'W', 'X', 'D', 'E', 'O', 'Q', 'R'}

# Pitch codes where batter made contact (subset of swings)
CONTACT_CODES = {'F', 'T', 'L', 'X', 'D', 'E', 'O', 'R'}

# Pitch codes that count as CSW (Called Strikes + Whiffs)
CSW_CODES = {'C', 'S', 'M', 'W', 'Q'}

# All codes that count as a pitch for Swing% denominator
PITCH_CODES = {'B', 'C', 'S', 'F', 'T', 'L', 'M', 'W', 'I', 'P', 'V', 'X', 'D', 'E', 'H', 'O', 'Q', 'R'}

# hitData.trajectory values from the MLB API
TRAJECTORY_GB = {'ground_ball'}
TRAJECTORY_FB = {'fly_ball', 'popup'}
TRAJECTORY_LD = {'line_drive'}

# Event types for classification
STRIKEOUT_EVENTS = {'strikeout', 'strikeout_double_play'}
WALK_EVENTS = {'walk', 'intent_walk', 'hit_by_pitch'}
HIT_EVENTS = {'single', 'double', 'triple', 'home_run'}

# Batted ball classification based on result text (fallback when no hitData)
GROUNDBALL_RESULTS = {
    'Groundout', 'Bunt Groundout', 'Grounded Into DP', 'Forceout',
    'Fielders Choice', 'Fielders Choice Out', 'Double Play'
}
FLYBALL_RESULTS = {'Flyout', 'Pop Out', 'Sac Fly'}
LINEDRIVE_RESULTS = {'Lineout'}

# Pull% coordinate thresholds
# Coordinates are centered at x≈125 for dead center from home plate's perspective
# Values <100 are right field side, values >150 are left field side
# Center is roughly 100-150
PULL_CENTER_LEFT = 100   # Below this = right field side
PULL_CENTER_RIGHT = 150  # Above this = left field side


def classify_batted_ball_from_trajectory(trajectory: Optional[str]) -> Optional[str]:
    """Classify using hitData.trajectory from the API (preferred method)."""
    if not trajectory:
        return None
    t = trajectory.lower()
    if t in TRAJECTORY_GB:
        return 'GB'
    if t in TRAJECTORY_FB:
        return 'FB'
    if t in TRAJECTORY_LD:
        return 'LD'
    return None


def classify_batted_ball_from_result(result: str, event_type: str, description: str = '') -> Optional[str]:
    """Classify using result text and description (fallback method)."""
    if not result:
        return None

    if result in GROUNDBALL_RESULTS:
        return 'GB'
    if result in FLYBALL_RESULTS:
        return 'FB'
    if result in LINEDRIVE_RESULTS:
        return 'LD'

    # Home runs are fly balls
    if event_type == 'home_run':
        return 'FB'

    # For hits, parse description for trajectory
    if event_type in HIT_EVENTS and description:
        desc_lower = description.lower()
        if 'ground ball' in desc_lower:
            return 'GB'
        if 'line drive' in desc_lower:
            return 'LD'
        if 'fly ball' in desc_lower or 'pop up' in desc_lower:
            return 'FB'

    return None


def determine_pull_from_coordinates(coord_x: Optional[float], batter_hand: str) -> Optional[bool]:
    """
    Determine if a ball in play was pulled using hit coordinates.

    The coordinate system has x≈125 as dead center. Values <100 are the
    right field side, values >150 are the left field side.
    Center (100-150) is not considered pull or oppo.

    Returns True if pull, False if oppo, None if center or unknown.
    """
    if coord_x is None or not batter_hand or batter_hand == 'S':
        return None

    if PULL_CENTER_LEFT <= coord_x <= PULL_CENTER_RIGHT:
        return None  # Center, not pull or oppo

    if batter_hand == 'R':
        # Right-handed batters pull to the left field side (x > 150)
        return coord_x > PULL_CENTER_RIGHT
    elif batter_hand == 'L':
        # Left-handed batters pull to the right field side (x < 100)
        return coord_x < PULL_CENTER_LEFT

    return None


def is_ball_in_play(event_type: str) -> bool:
    """Check if the at-bat resulted in a ball in play."""
    if not event_type:
        return False
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
        self.bip_with_direction = 0
        self.pull_hits = 0
        self.air_balls_with_direction = 0
        self.pull_air_balls = 0

        # Pitch-level stats (from individual pitch call codes)
        self.total_pitches = 0
        self.swings = 0
        self.contacts = 0
        self.called_strikes_whiffs = 0  # CSW

        # Whether we have pitch-level data
        self.has_pitch_data = False

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
        self.has_pitch_data = False
        self.vs_left = None
        self.vs_right = None

    def add_at_bat(self, at_bat: dict, opponent_hand: str = None, batter_hand: str = None):
        """Process an at-bat and update stats."""
        event_type = at_bat.get('eventType', '')
        result = at_bat.get('result', '')
        description = at_bat.get('description', '')
        pitches = at_bat.get('pitches', [])

        # --- Batted ball classification ---
        # Prefer hitData.trajectory from pitch-level data (last pitch)
        bb_type = None
        trajectory = None
        coord_x = None
        if pitches:
            last_pitch = pitches[-1]
            trajectory = last_pitch.get('trajectory')
            coord_x = last_pitch.get('coordX')
            bb_type = classify_batted_ball_from_trajectory(trajectory)

        # Fallback to result/description parsing
        if bb_type is None:
            bb_type = classify_batted_ball_from_result(result, event_type, description)

        if bb_type == 'GB':
            self.ground_balls += 1
        elif bb_type == 'FB':
            self.fly_balls += 1
            if event_type == 'home_run':
                self.home_runs += 1
        elif bb_type == 'LD':
            self.line_drives += 1

        # --- Pull stats ---
        if is_ball_in_play(event_type) and batter_hand and batter_hand != 'S':
            # Prefer coordinate-based pull detection
            is_pull = determine_pull_from_coordinates(coord_x, batter_hand)

            if is_pull is not None:
                self.bip_with_direction += 1
                if is_pull:
                    self.pull_hits += 1

                # Track air balls for Pull-Air%
                is_air = bb_type in ('FB', 'LD')
                # Also use trajectory if available
                if not is_air and trajectory:
                    is_air = trajectory.lower() in ('fly_ball', 'line_drive', 'popup')
                if is_air:
                    self.air_balls_with_direction += 1
                    if is_pull:
                        self.pull_air_balls += 1

        # --- Pitch-level stats ---
        if pitches:
            self.has_pitch_data = True
            for p in pitches:
                code = p.get('call', '')
                if code in PITCH_CODES:
                    self.total_pitches += 1
                    if code in SWING_CODES:
                        self.swings += 1
                    if code in CONTACT_CODES:
                        self.contacts += 1
                    if code in CSW_CODES:
                        self.called_strikes_whiffs += 1
        else:
            # Legacy data without pitch-level detail: only count total pitches
            pitch_count = at_bat.get('pitchCount', 0)
            if pitch_count > 0:
                self.total_pitches += pitch_count

        # Track splits by opponent hand
        if opponent_hand == 'L' and self.vs_left is not None:
            self.vs_left.add_at_bat(at_bat, None, batter_hand)
        elif opponent_hand == 'R' and self.vs_right is not None:
            self.vs_right.add_at_bat(at_bat, None, batter_hand)

    def get_stats(self, is_batter: bool = True, min_bip: int = 10, min_pitches: int = 50,
                   min_direction: int = 10) -> dict:
        """Calculate final rate stats from accumulated counts.

        Args:
            is_batter: Whether this player is a batter (enables pull stats).
            min_bip: Minimum classifiable BIP for batted ball rates.
            min_pitches: Minimum pitches for plate discipline stats.
            min_direction: Minimum BIP with direction for pull stats.
        """
        stats = {}

        # Batted ball rates (among classifiable BIP)
        classifiable_bip = self.ground_balls + self.fly_balls + self.line_drives
        # Always output BIP count so frontend can weight by BIP when aggregating months
        stats['BIP'] = classifiable_bip
        if classifiable_bip >= min_bip:
            stats['GB%'] = round(self.ground_balls / classifiable_bip, 3)
            stats['FB%'] = round(self.fly_balls / classifiable_bip, 3)
            stats['LD%'] = round(self.line_drives / classifiable_bip, 3)

            # HR/FB rate
            if self.fly_balls > 0:
                stats['HR/FB'] = round(self.home_runs / self.fly_balls, 3)

        # Pull stats (batters only)
        if is_batter:
            if self.bip_with_direction >= min_direction:
                stats['Pull%'] = round(self.pull_hits / self.bip_with_direction, 3)

            if self.air_balls_with_direction >= min_direction:
                stats['Pull-Air%'] = round(self.pull_air_balls / self.air_balls_with_direction, 3)

        # Plate discipline stats (only when pitch-level data is available)
        if self.has_pitch_data and self.total_pitches >= min_pitches:
            stats['Swing%'] = round(self.swings / self.total_pitches, 3)
            if self.swings > 0:
                stats['Contact%'] = round(self.contacts / self.swings, 3)
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
                batter_stats[bid].add_at_bat(at_bat, pitcher_hand, batter_hand)
                batter_stats_by_level[bid][level].add_at_bat(at_bat, pitcher_hand, batter_hand)

            if pitcher_id:
                pid = str(pitcher_id)
                pitcher_stats[pid].add_at_bat(at_bat, batter_hand, None)
                pitcher_stats_by_level[pid][level].add_at_bat(at_bat, batter_hand, None)

    return dict(batter_stats), dict(pitcher_stats), dict(batter_stats_by_level), dict(pitcher_stats_by_level)


def process_games_per_game(games: list[dict]) -> tuple[dict, dict]:
    """
    Process PBP games to calculate per-game advanced stats for each player.

    Returns:
        (batter_per_game, pitcher_per_game)
        - batter_per_game: dict mapping player_id to {gamePk: PlayerAdvancedStats}
        - pitcher_per_game: dict mapping player_id to {gamePk: PlayerAdvancedStats}
    """
    batter_per_game: dict[str, dict[int, PlayerAdvancedStats]] = defaultdict(lambda: defaultdict(PlayerAdvancedStats))
    pitcher_per_game: dict[str, dict[int, PlayerAdvancedStats]] = defaultdict(lambda: defaultdict(PlayerAdvancedStats))

    for game in games:
        game_pk = game.get('gamePk')
        if not game_pk:
            continue

        for at_bat in game.get('atBats', []):
            batter_id = at_bat.get('batterId')
            pitcher_id = at_bat.get('pitcherId')
            batter_hand = at_bat.get('batterHand')
            pitcher_hand = at_bat.get('pitcherHand')

            if batter_id:
                bid = str(batter_id)
                batter_per_game[bid][game_pk].add_at_bat(at_bat, pitcher_hand, batter_hand)

            if pitcher_id:
                pid = str(pitcher_id)
                pitcher_per_game[pid][game_pk].add_at_bat(at_bat, batter_hand, None)

    return dict(batter_per_game), dict(pitcher_per_game)


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
    stats_key = 'batting' if stat_type == 'batting' else 'pitching'

    if stats_key not in player_data:
        player_data[stats_key] = {}

    # Remove stale PBP stats that may be from old inaccurate calculations
    # (they'll be re-added below if pitch-level data is available)
    stale_keys = ['Swing%', 'Contact%', 'CSW%', 'Whiff%']
    for key in stale_keys:
        player_data[stats_key].pop(key, None)

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
        # Clean stale stats from existing splits
        for split_name in list(player_data[splits_key].keys()):
            split_data = player_data[splits_key].get(split_name)
            if isinstance(split_data, dict):
                for key in stale_keys:
                    split_data.pop(key, None)

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


def inject_per_game_stats(players: dict, batter_per_game: dict, pitcher_per_game: dict) -> int:
    """
    Inject per-game PBP-derived stats into game log entries.

    Uses relaxed minimums (1 BIP, 1 pitch) since rolling windows handle noise.

    Returns number of game log entries updated.
    """
    injected = 0

    for player_id, game_stats in batter_per_game.items():
        if player_id not in players:
            continue
        game_logs = players[player_id].get('battingGameLog', [])
        for log_entry in game_logs:
            game_id = log_entry.get('gameId')
            if game_id and game_id in game_stats:
                per_game = game_stats[game_id].get_stats(
                    is_batter=True, min_bip=1, min_pitches=1, min_direction=1
                )
                # Inject PBP stats into the game's stats dict
                stats = log_entry.get('stats', {})
                for key, value in per_game.items():
                    if value is not None:
                        stats[key] = value
                log_entry['stats'] = stats
                injected += 1

    for player_id, game_stats in pitcher_per_game.items():
        if player_id not in players:
            continue
        game_logs = players[player_id].get('pitchingGameLog', [])
        for log_entry in game_logs:
            game_id = log_entry.get('gameId')
            if game_id and game_id in game_stats:
                per_game = game_stats[game_id].get_stats(
                    is_batter=False, min_bip=1, min_pitches=1, min_direction=1
                )
                stats = log_entry.get('stats', {})
                for key, value in per_game.items():
                    if value is not None:
                        stats[key] = value
                log_entry['stats'] = stats
                injected += 1

    return injected


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

    # Check if pitch-level data is available
    has_pitch_data = False
    for game in games[:5]:
        for ab in game.get('atBats', [])[:3]:
            if ab.get('pitches'):
                has_pitch_data = True
                break
        if has_pitch_data:
            break
    if has_pitch_data:
        logger.info("Pitch-level data detected (call codes, hitData available)")
    else:
        logger.info("Legacy PBP data (at-bat level only, no Swing%/Contact%/CSW%)")

    # Calculate stats from PBP (monthly aggregates)
    batter_stats, pitcher_stats, batter_by_level, pitcher_by_level = process_games_for_stats(games)

    # Calculate per-game stats from PBP
    batter_per_game, pitcher_per_game = process_games_per_game(games)

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

    # Inject per-game PBP stats into game log entries
    injected = inject_per_game_stats(players, batter_per_game, pitcher_per_game)
    logger.info(f"Injected PBP stats into {injected} game log entries")

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
