"""Season-to-date and last-4 aggregates from player_week_usage."""

from __future__ import annotations

import polars as pl

SUM_COLS = [
    "snaps", "team_snaps", "targets", "team_targets", "receptions", "rec_yards", "rec_tds",
    "air_yards", "team_air_yards", "first_read_targets", "team_first_read_targets",
    "rz_targets", "ez_targets", "routes_proxy", "team_dropbacks",
    "carries", "rush_yards", "rush_tds", "team_rb_carries", "team_rb_targets",
    "rz_carries", "inside5_carries", "passing_down_snaps", "fantasy_points_ppr",
]


def _ratio(num: str, den: str) -> pl.Expr:
    return pl.when(pl.col(den) > 0).then(pl.col(num) / pl.col(den)).otherwise(None)


def _aggregate(pwu: pl.DataFrame, scope: str) -> pl.DataFrame:
    played = pwu.with_columns(
        played=((pl.col("snaps").fill_null(0) > 0) | (pl.col("targets") > 0) | (pl.col("carries") > 0)).cast(pl.Int32)
    )
    agg = played.sort(["season", "gsis_id", "week"]).group_by(["season", "gsis_id"]).agg(
        [pl.col("team").last(), pl.col("position").last(), pl.col("played").sum().alias("games")]
        + [pl.col(c).sum().alias(c) for c in SUM_COLS]
        + [pl.col("team_snaps").filter(pl.col("snaps").is_not_null()).sum().alias("team_snaps_played")]
        # first-read denominators only from games where FTN landed
        + [pl.col("team_first_read_targets").filter(~pl.col("ftn_pending")).sum().alias("team_fr_avail")]
    )
    is_rb = pl.col("position").is_in(["RB", "FB"])
    agg = agg.with_columns(
        snap_pct=_ratio("snaps", "team_snaps_played"),
        target_share=_ratio("targets", "team_targets"),
        targets_pg=_ratio("targets", "games"),
        air_yards_share=_ratio("air_yards", "team_air_yards"),
        adot=_ratio("air_yards", "targets"),
        first_read_share=_ratio("first_read_targets", "team_fr_avail"),
        route_pct=_ratio("routes_proxy", "team_dropbacks"),
        tprr_proxy=_ratio("targets", "routes_proxy"),
        carries_pg=_ratio("carries", "games"),
        carry_share=pl.when(is_rb).then(_ratio("carries", "team_rb_carries")).otherwise(None),
        rb_target_share=pl.when(is_rb).then(_ratio("targets", "team_rb_targets")).otherwise(None),
    ).with_columns(
        wopr=1.5 * pl.col("target_share").fill_null(0) + 0.7 * pl.col("air_yards_share").fill_null(0),
        scope=pl.lit(scope),
    ).drop(["team_snaps_played", "team_fr_avail"])
    return agg.filter(pl.col("games") > 0)


def build_player_season_usage(pwu: pl.DataFrame, team_ctx: pl.DataFrame) -> pl.DataFrame:
    """Two scopes per season: 'season' (all completed weeks) and 'last4' (team's last 4 games)."""
    season = _aggregate(pwu, "season")

    # last 4 weeks each team actually played (completed games only)
    played_weeks = (
        team_ctx.filter(pl.col("plays").is_not_null())
        .select(["season", "team", "week"]).unique()
        .sort(["season", "team", "week"], descending=[False, False, True])
        .with_columns(rank=pl.int_range(pl.len()).over(["season", "team"]))
        .filter(pl.col("rank") < 4)
        .drop("rank")
    )
    last4_rows = pwu.join(played_weeks, on=["season", "team", "week"], how="inner")
    last4 = _aggregate(last4_rows, "last4")

    cols = [
        "season", "scope", "gsis_id", "team", "position", "games",
        "snaps", "team_snaps", "snap_pct",
        "targets", "team_targets", "target_share", "targets_pg", "receptions", "rec_yards", "rec_tds",
        "air_yards", "team_air_yards", "air_yards_share", "wopr", "adot",
        "first_read_targets", "team_first_read_targets", "first_read_share",
        "rz_targets", "ez_targets", "routes_proxy", "team_dropbacks", "route_pct", "tprr_proxy",
        "carries", "carries_pg", "rush_yards", "rush_tds", "team_rb_carries", "carry_share",
        "team_rb_targets", "rb_target_share", "rz_carries", "inside5_carries", "passing_down_snaps",
        "fantasy_points_ppr",
    ]
    return pl.concat([season.select(cols), last4.select(cols)])
