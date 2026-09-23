"""Shared constants for the ETL."""

from __future__ import annotations

import datetime as dt

SKILL_POSITIONS = {"QB", "RB", "WR", "TE", "FB"}
BACKFIELD_POSITIONS = {"RB", "FB"}

# FTN read_thrown values that count as "first read / designed"
FIRST_READ_VALUES = {"1", "DES"}

# Seasons with nflverse participation data (routes proxy). Later seasons have none.
PARTICIPATION_SEASONS = range(2016, 2026)

# Injury statuses that remove a player from projections
OUT_STATUSES = {"Out", "Doubtful", "IR", "PUP", "Sus", "NA", "DNR", "COV"}

# Projection model knobs
EWM_DECAY = 0.8          # weight = decay ** games_ago, last 6 games
EWM_GAMES = 6
FIRST_READ_BLEND = 0.3   # weight on first-read share vs target share
MATCHUP_SHRINK_K = 4.0   # ratio shrunk toward 1 by n / (n + k)
RANGE_LOW, RANGE_HIGH = 0.7, 1.3


def current_season(today: dt.date | None = None) -> int:
    """NFL season year: March onward counts as the upcoming season."""
    today = today or dt.date.today()
    return today.year if today.month >= 3 else today.year - 1
