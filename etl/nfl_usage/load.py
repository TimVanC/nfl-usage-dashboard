"""Thin wrappers around nflreadpy loads, filtered to what the ETL needs."""

from __future__ import annotations

import logging

import nflreadpy as nfl
import polars as pl

from .config import PARTICIPATION_SEASONS

log = logging.getLogger(__name__)

PBP_COLS = [
    "play_id", "game_id", "season", "week", "season_type", "posteam", "defteam",
    "home_team", "away_team", "play_type", "pass", "rush", "qb_dropback", "qb_scramble",
    "sack", "two_point_attempt", "play_deleted", "penalty", "aborted_play",
    "receiver_player_id", "rusher_player_id", "passer_player_id",
    "air_yards", "yardline_100", "down", "ydstogo", "qtr",
    "half_seconds_remaining", "game_seconds_remaining", "drive",
    "wp", "vegas_wp", "score_differential", "xpass", "pass_oe", "complete_pass", "yards_gained",
    "pass_touchdown", "rush_touchdown", "rushing_yards", "receiving_yards", "epa", "desc",
]


def load_pbp(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_pbp(seasons=seasons)
    cols = [c for c in PBP_COLS if c in df.columns]
    df = df.select(cols).filter(pl.col("season_type") == "REG")
    log.info("pbp: %d plays, seasons %s", df.height, seasons)
    return df


def load_snaps(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_snap_counts(seasons=seasons).filter(pl.col("game_type") == "REG")
    log.info("snap counts: %d rows", df.height)
    return df


def load_ftn(seasons: list[int]) -> pl.DataFrame:
    frames = []
    for s in seasons:
        if s < 2022:
            continue
        try:
            frames.append(nfl.load_ftn_charting(seasons=[s]))
        except Exception as e:  # noqa: BLE001
            log.warning("ftn charting unavailable for %s: %s", s, e)
    if not frames:
        return pl.DataFrame(schema={"nflverse_game_id": pl.Utf8, "nflverse_play_id": pl.Int64, "read_thrown": pl.Utf8})
    df = pl.concat(frames, how="diagonal_relaxed").select(
        ["nflverse_game_id", "nflverse_play_id", "read_thrown", "is_screen_pass", "is_play_action"]
    )
    log.info("ftn: %d plays", df.height)
    return df


def load_participation(seasons: list[int]) -> pl.DataFrame | None:
    ok = [s for s in seasons if s in PARTICIPATION_SEASONS]
    if not ok:
        return None
    frames = []
    for s in ok:
        try:
            frames.append(
                nfl.load_participation(seasons=[s]).select(
                    ["nflverse_game_id", "play_id", "possession_team", "offense_players"]
                ).with_columns(pl.col("play_id").cast(pl.Float64))
            )
        except Exception as e:  # noqa: BLE001
            log.warning("participation unavailable for %s: %s", s, e)
    if not frames:
        return None
    df = pl.concat(frames)
    log.info("participation: %d plays", df.height)
    return df


def load_schedules(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_schedules(seasons=seasons)
    return df.select(
        ["game_id", "season", "game_type", "week", "gameday", "home_team", "away_team",
         "home_score", "away_score", "spread_line", "total_line", "result"]
    )


def load_rosters_weekly(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_rosters_weekly(seasons=seasons)
    return df.select(
        ["season", "week", "team", "gsis_id", "full_name", "position", "headshot_url", "sleeper_id", "status"]
    ).filter(pl.col("gsis_id").is_not_null())


def load_players() -> pl.DataFrame:
    df = nfl.load_players()
    return df.select(
        ["gsis_id", "display_name", "short_name", "position", "latest_team", "headshot", "pfr_id"]
    ).filter(pl.col("gsis_id").is_not_null())


def load_injuries(seasons: list[int]) -> pl.DataFrame:
    try:
        df = nfl.load_injuries(seasons=seasons)
    except Exception as e:  # noqa: BLE001
        log.warning("injuries unavailable: %s", e)
        return pl.DataFrame()
    return df.filter(pl.col("game_type") == "REG").select(
        ["season", "week", "team", "gsis_id", "position", "report_status", "practice_status", "report_primary_injury"]
    )


def load_teams() -> pl.DataFrame:
    df = nfl.load_teams()
    return df.select(
        ["team_abbr", "team_name", "team_nick", "team_conf", "team_division",
         "team_color", "team_color2", "team_logo_espn"]
    )


def load_box_scores(seasons: list[int]) -> pl.DataFrame:
    """nflverse player-week stats, used only for validation."""
    df = nfl.load_player_stats(seasons=seasons).filter(pl.col("season_type") == "REG")
    return df.select(
        ["player_id", "season", "week", "team", "position", "targets", "receptions", "receiving_yards",
         "carries", "rushing_yards", "receiving_air_yards", "target_share", "fantasy_points_ppr"]
    )
