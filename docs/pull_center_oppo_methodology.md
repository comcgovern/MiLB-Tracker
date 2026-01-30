# Pull%, Center%, and Oppo% Calculation Methodology

## Overview

Pull%, Center%, and Oppo% measure the directional distribution of a batter's batted balls. These metrics indicate whether a hitter tends to pull the ball (hit it to their "strong side"), go the opposite way, or spray the ball to center field.

For a **right-handed batter**: Pull = left field, Oppo = right field  
For a **left-handed batter**: Pull = right field, Oppo = left field

This document describes how to calculate these percentages from MLB play-by-play coordinate data, reverse-engineered from FanGraphs classifications.

## Data Requirements

Each batted ball needs the following fields from the play-by-play data:

| Field | Description | Example |
|-------|-------------|---------|
| `hitData.coordinates.coordX` | Horizontal landing coordinate | 116.53 |
| `hitData.coordinates.coordY` | Vertical landing coordinate (positive value) | 151.22 |
| `hitData.trajectory` | Batted ball type | `ground_ball`, `line_drive`, `fly_ball`, `popup` |
| Batter handedness | Which side the batter hits from | `R` or `L` |

**Note on coordY:** The raw play-by-play data may contain negative Y values. Use the absolute/positive value for these calculations. The coordinate system places home plate at approximately (125.42, 198.27).

## Step 1: Calculate Spray Angle

The spray angle measures the horizontal direction of a batted ball relative to straightaway center field. This formula is adapted from the Zimmerman method documented on FanGraphs:

```
spray_angle = atan((coordX - 125.42) / (198.27 - coordY)) × (180 / π) × 0.75
```

### Formula Components

| Component | Value | Purpose |
|-----------|-------|---------|
| `coordX` | varies | Horizontal hit coordinate |
| `coordY` | varies | Vertical hit coordinate (positive) |
| `125.42` | constant | X-coordinate of home plate |
| `198.27` | constant | Y-coordinate of home plate |
| `180 / π` | ~57.296 | Converts radians to degrees |
| `0.75` | constant | Scaling factor to compress angle range |

### Spray Angle Interpretation

| Spray Angle | Direction |
|-------------|-----------|
| -45° | Left field line |
| -22° to -30° | Left field |
| ~0° | Center field |
| +22° to +30° | Right field |
| +45° | Right field line |

**For right-handed batters:** Negative angles = Pull side (left field)  
**For left-handed batters:** Negative angles = Oppo side (left field)

## Step 2: Apply Trajectory-Specific Thresholds

**Critical finding:** FanGraphs uses different classification thresholds depending on the batted ball trajectory. Ground balls have a wider "pull" zone than air balls.

### Thresholds for Right-Handed Batters

| Trajectory | Pull | Center | Oppo |
|------------|------|--------|------|
| `ground_ball` | spray_angle < **-7.5°** | -7.5° ≤ spray_angle ≤ 5.0° | spray_angle > **5.0°** |
| `fly_ball` | spray_angle < **-22.0°** | -22.0° ≤ spray_angle ≤ 10.0° | spray_angle > **10.0°** |
| `line_drive` | spray_angle < **-22.0°** | -22.0° ≤ spray_angle ≤ 10.0° | spray_angle > **10.0°** |
| `popup` | spray_angle < **-22.0°** | -22.0° ≤ spray_angle ≤ 10.0° | spray_angle > **10.0°** |

### Thresholds for Left-Handed Batters

For left-handed batters, **negate the spray angle** before applying thresholds, then use the same threshold values as above.

```
adjusted_spray_angle = -1 × spray_angle  (for LHB only)
```

### Why Trajectory Matters

The trajectory-specific thresholds reflect how fielders are positioned:

- A **ground ball** to the shortstop area (moderate negative angle) is a "pulled" ball for a RHH because it went to the pull side of the infield
- A **fly ball** at the same angle would be caught by the center fielder or left-center fielder and is classified as "center"
- This means ground balls require less extreme angles to be classified as pulled or opposite field

## Step 3: Calculate Percentages

After classifying each batted ball:

```
Pull%   = (Count of "Pull" batted balls / Total batted balls) × 100
Center% = (Count of "Center" batted balls / Total batted balls) × 100  
Oppo%   = (Count of "Oppo" batted balls / Total batted balls) × 100
```

## Implementation Example (Python)

```python
import numpy as np

def calculate_spray_angle(coord_x, coord_y):
    """Calculate spray angle from hit coordinates."""
    return round(
        np.arctan((coord_x - 125.42) / (198.27 - coord_y)) * 180 / np.pi * 0.75,
        1
    )

def classify_batted_ball(spray_angle, trajectory, batter_side):
    """
    Classify a batted ball as Pull, Center, or Oppo.
    
    Args:
        spray_angle: Spray angle in degrees
        trajectory: 'ground_ball', 'line_drive', 'fly_ball', or 'popup'
        batter_side: 'R' or 'L'
    
    Returns:
        'Pull', 'Center', or 'Oppo'
    """
    # Flip angle for left-handed batters
    if batter_side == 'L':
        spray_angle = -spray_angle
    
    # Apply trajectory-specific thresholds
    if trajectory == 'ground_ball':
        pull_threshold = -7.5
        oppo_threshold = 5.0
    else:  # fly_ball, line_drive, popup
        pull_threshold = -22.0
        oppo_threshold = 10.0
    
    if spray_angle < pull_threshold:
        return 'Pull'
    elif spray_angle > oppo_threshold:
        return 'Oppo'
    else:
        return 'Center'
```

## Implementation Example (R)

```r
calculate_spray_angle <- function(coord_x, coord_y) {
  round(
    atan((coord_x - 125.42) / (198.27 - coord_y)) * 180 / pi * 0.75,
    1
  )
}

classify_batted_ball <- function(spray_angle, trajectory, batter_side) {
  # Flip angle for left-handed batters
  if (batter_side == "L") {
    spray_angle <- -spray_angle
  }
  
  # Apply trajectory-specific thresholds
  if (trajectory == "ground_ball") {
    pull_threshold <- -7.5
    oppo_threshold <- 5.0
  } else {
    pull_threshold <- -22.0
    oppo_threshold <- 10.0
  }
  
  if (spray_angle < pull_threshold) {
    return("Pull")
  } else if (spray_angle > oppo_threshold) {
    return("Oppo")
  } else {
    return("Center")
  }
}
```

## Validation

This methodology was validated against FanGraphs data for Aidan Miller (RHB) at AAA in September 2025.

**FanGraphs reported:** 55% Pull, 30% Center, 15% Oppo (11-6-3 split over 20 batted balls)  
**This methodology produced:** 55% Pull, 30% Center, 15% Oppo (11-6-3 split)  
**Accuracy:** 20/20 individual batted balls correctly classified (100%)

### Validation Data Details

| coordX | coordY | Trajectory | Spray Angle | FanGraphs | Calculated |
|--------|--------|------------|-------------|-----------|------------|
| 33.58 | 95.50 | line_drive | -31.3° | Pull | Pull |
| 44.20 | 104.29 | line_drive | -30.6° | Pull | Pull |
| 57.60 | 110.14 | line_drive | -28.2° | Pull | Pull |
| 67.68 | 101.03 | line_drive | -23.0° | Pull | Pull |
| 88.12 | 155.93 | line_drive | -31.0° | Pull | Pull |
| 95.51 | 79.10 | fly_ball | -10.6° | Center | Center |
| 102.02 | 168.19 | ground_ball | -28.4° | Pull | Pull |
| 105.00 | 40.96 | line_drive | -5.5° | Center | Center |
| 108.62 | 158.02 | ground_ball | -17.0° | Pull | Pull |
| 109.64 | 74.60 | ground_ball | -5.5° | Center | Center |
| 110.29 | 167.85 | ground_ball | -19.8° | Pull | Pull |
| 110.65 | 175.31 | ground_ball | -24.6° | Pull | Pull |
| 112.52 | 179.05 | ground_ball | -25.4° | Pull | Pull |
| 116.53 | 151.22 | ground_ball | -8.0° | Pull | Pull |
| 122.39 | 146.20 | ground_ball | -2.5° | Center | Center |
| 126.45 | 130.73 | ground_ball | 0.7° | Center | Center |
| 136.78 | 92.80 | fly_ball | 4.6° | Center | Center |
| 139.59 | 146.00 | ground_ball | 11.4° | Oppo | Oppo |
| 149.51 | 195.77 | popup | 63.1° | Oppo | Oppo |
| 168.66 | 116.65 | line_drive | 20.9° | Oppo | Oppo |

### Key Validation Insight

Row 14 (coordX=116.53, ground_ball, -8.0°) is classified as **Pull** while Row 6 (coordX=95.51, fly_ball, -10.6°) is classified as **Center**, despite the fly ball having a more extreme pull-side angle. This confirms that trajectory-specific thresholds are essential for matching FanGraphs classifications.

## Source Attribution

The base spray angle formula originates from Jeff and Darrell Zimmerman, as documented in the FanGraphs Guts! page under "Omissions." The trajectory-specific thresholds were reverse-engineered from FanGraphs classification data.

## Edge Cases and Notes

1. **Missing trajectory data:** If trajectory is unavailable, default to air ball thresholds (-22.0° / 10.0°) as they are more conservative.

2. **Bunt attempts:** Exclude bunts from pull/center/oppo calculations (they are typically excluded from batted ball profile metrics).

3. **Switch hitters:** Use the batter's handedness for the specific plate appearance, not their default side.

4. **Coordinate system variations:** The constants (125.42, 198.27) are calibrated for standard MLB/MiLB coordinate systems. If your data source uses a different coordinate system, these may need adjustment.
