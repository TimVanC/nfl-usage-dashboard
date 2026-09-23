"""Projection model v1: volume (targets, carries) for the next week.

ProjTargets_i = ProjPassAtt_team * Share_i * InjuryAdj_i * MatchupAdj_i

1. Team pass attempts: least-squares regression on implied total, spread,
   neutral pass rate and pace (season-to-date team averages, blended with the
   prior season early in the year).
2. Weighted share: exponentially weighted target share over the last 6 games,
   blended with first-read share.
3. Injury redistribution: Out/Doubtful players' share flows to teammates,
   70% to the same position group, 30% to the rest of the skill players.
4. Matchup: opponent target rate allowed by position vs league average,
   shrunk toward 1.0 by n / (n + k).
5. Carries: same structure with projected rush attempts and carry share.
"""

from __future__ import annotations

import datetime as dt
import logging

import numpy as np
import polars as pl

from .config import (
    EWM_DECAY, EWM_GAMES, FIRST_READ_BLEND, MATCHUP_SHRINK_K, OUT_STATUSES, RANGE_HIGH, RANGE_LOW,
    SKILL_POSITIONS,
)

log = logging.getLogger(__name__)


# --------------------------------------------------------------------------- team volume

def _team_rates(team_ctx: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Season-to-date neutral pass rate / pace per team, blended with prior season for week < 5."""
    cur = (
        team_ctx.filter((pl.col("season") == season) & (pl.col("week") < week) & pl.col("plays").is_not_null())
        .group_by("team").agg(npr=pl.col("neutral_pass_rate").mean(), pace=pl.col("pace").mean(), n=pl.len())
    )
    prev = (
        team_ctx.filter((pl.col("season") == season - 1) & pl.col("plays").is_not_null())
        .group_by("team").agg(npr_p=pl.col("neutral_pass_rate").mean(), pace_p=pl.col("pace").mean())
    )
    lg = team_ctx.filter(pl.col("plays").is_not_null()).select(
        pl.col("neutral_pass_rate").mean().alias("npr_l"), pl.col("pace").mean().alias("pace_l")
    ).row(0)
    df = cur.join(prev, on="team", how="full", coalesce=True)
    w = (pl.col("n").fill_null(0) / 4.0).clip(0, 1)  # full weight on current season by game 4
    return df.with_columns(
        npr=w * pl.col("npr").fill_null(lg[0]) + (1 - w) * pl.col("npr_p").fill_null(lg[0]),
        pace=w * pl.col("pace").fill_null(lg[1]) + (1 - w) * pl.col("pace_p").fill_null(lg[1]),
    ).select(["team", "npr", "pace"])


def _fit_volume(team_ctx: pl.DataFrame, target: str) -> np.ndarray | None:
    hist = team_ctx.filter(
        pl.col(target).is_not_null() & pl.col("implied_total").is_not_null() & pl.col("spread_line").is_not_null()
        & pl.col("neutral_pass_rate").is_not_null() & pl.col("pace").is_not_null()
    )
    if hist.height < 64:
        return None
    X = np.column_stack([
        np.ones(hist.height),
        hist["implied_total"].to_numpy(),
        hist["spread_line"].to_numpy(),
        hist["neutral_pass_rate"].to_numpy(),
        hist["pace"].to_numpy(),
    ])
    y = hist[target].to_numpy().astype(float)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return beta


def project_team_volume(team_ctx: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Projected pass and rush attempts for every team playing in (season, week)."""
    games = team_ctx.filter((pl.col("season") == season) & (pl.col("week") == week)).select(
        ["team", "opponent", "implied_total", "spread_line", "total_line"]
    )
    rates = _team_rates(team_ctx, season, week)
    df = games.join(rates, on="team", how="left")
    lg_pass = team_ctx.filter(pl.col("pass_attempts").is_not_null())["pass_attempts"].mean() or 33.0
    lg_rush = team_ctx.filter(pl.col("rush_attempts").is_not_null())["rush_attempts"].mean() or 26.0
    df = df.with_columns(
        implied_total=pl.col("implied_total").fill_null(22.0),
        spread_line=pl.col("spread_line").fill_null(0.0),
    )
    out = {}
    for tgt, fallback in [("pass_attempts", lg_pass), ("rush_attempts", lg_rush)]:
        beta = _fit_volume(team_ctx, tgt)
        if beta is None:
            out[tgt] = np.full(df.height, fallback)
            continue
        X = np.column_stack([
            np.ones(df.height), df["implied_total"].to_numpy(), df["spread_line"].to_numpy(),
            df["npr"].to_numpy(), df["pace"].to_numpy(),
        ])
        out[tgt] = np.clip(X @ beta, 15, 55)
    return df.with_columns(
        proj_pass_attempts=pl.Series(out["pass_attempts"]),
        proj_rush_attempts=pl.Series(out["rush_attempts"]),
    ).select(["team", "opponent", "proj_pass_attempts", "proj_rush_attempts"])


# --------------------------------------------------------------------------- shares

def weighted_shares(pwu: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """EWM target/carry share per player over the last EWM_GAMES games before `week`."""
    hist = (
        pwu.filter((pl.col("season") == season) & (pl.col("week") < week) & pl.col("position").is_in(list(SKILL_POSITIONS)))
        .sort(["gsis_id", "week"], descending=[False, True])
        .with_columns(k=pl.int_range(pl.len()).over("gsis_id"))
        .filter(pl.col("k") < EWM_GAMES)
        .with_columns(w=pl.lit(EWM_DECAY) ** pl.col("k"))
    )

    def ewm(col: str) -> pl.Expr:
        v = pl.col(col)
        den = pl.col("w").filter(v.is_not_null()).sum()
        return pl.when(den > 0).then((v.fill_null(0) * pl.col("w")).sum() / den).otherwise(None)

    agg = hist.group_by("gsis_id").agg(
        team=pl.col("team").first(),
        position=pl.col("position").first(),
        games=pl.len(),
        ts=ewm("target_share"),
        frs=ewm("first_read_share"),
        cs=ewm("carry_share"),
        i5=ewm("inside5_carries"),
    )
    # team RB carries denominator and "carries per team rush attempt" for non-RBs (QB scrambles etc.)
    return agg.with_columns(
        weighted_target_share=pl.when(pl.col("frs").is_not_null())
        .then((1 - FIRST_READ_BLEND) * pl.col("ts") + FIRST_READ_BLEND * pl.col("frs"))
        .otherwise(pl.col("ts")),
        weighted_carry_share=pl.col("cs"),
    ).select(["gsis_id", "team", "position", "games", "weighted_target_share", "weighted_carry_share"])


# --------------------------------------------------------------------------- matchup

def matchup_adjustments(pwu: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Per (defense, position) ratio of targets allowed per game vs league average, shrunk toward 1."""
    hist = pwu.filter((pl.col("season") == season) & (pl.col("week") < week) & pl.col("opponent").is_not_null())
    if hist.height == 0:
        return pl.DataFrame(schema={"opponent": pl.Utf8, "position": pl.Utf8, "matchup_adj": pl.Float64})
    grp = pl.when(pl.col("position").is_in(["RB", "FB"])).then(pl.lit("RB")).otherwise(pl.col("position"))
    h = hist.with_columns(pos_grp=grp)
    per_def = h.group_by(["opponent", "pos_grp"]).agg(
        tgt=pl.col("targets").sum(), games=pl.col("week").n_unique()
    ).with_columns(tgt_pg=pl.col("tgt") / pl.col("games"))
    lg = per_def.group_by("pos_grp").agg(lg_pg=pl.col("tgt").sum() / pl.col("games").sum())
    out = per_def.join(lg, on="pos_grp").with_columns(
        ratio=pl.col("tgt_pg") / pl.col("lg_pg"),
        shrink=pl.col("games") / (pl.col("games") + MATCHUP_SHRINK_K),
    ).with_columns(matchup_adj=1 + (pl.col("ratio") - 1) * pl.col("shrink"))
    return out.select(["opponent", pl.col("pos_grp").alias("position"), "matchup_adj"])


# --------------------------------------------------------------------------- injuries

def injury_adjustments(shares: pl.DataFrame, injuries: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Return shares with injury_adj and redistributed target/carry shares."""
    inj = injuries.filter((pl.col("season") == season) & (pl.col("week") == week))
    status = pl.coalesce(["sleeper_status", "report_status"])
    out_ids = set(inj.filter(status.is_in(list(OUT_STATUSES)))["gsis_id"].to_list()) if inj.height else set()
    # players on IR per Sleeper regardless of week row
    df = shares.with_columns(is_out=pl.col("gsis_id").is_in(list(out_ids)))

    def redistribute(col: str) -> pl.DataFrame:
        """Freed share: 70% to healthy players in the same position group, the rest team-wide.
        If a group has no healthy player, its 70% falls back to the team-wide pool."""
        base = pl.col(col).fill_null(0)
        d = df.with_columns(base.alias("_base"))
        groups = d.group_by(["team", "position"]).agg(
            freed_pos=(pl.col("_base") * pl.col("is_out")).sum(),
            healthy_pos=(pl.col("_base") * ~pl.col("is_out")).sum(),
        ).with_columns(pos_dist=pl.when(pl.col("healthy_pos") > 0).then(0.7 * pl.col("freed_pos")).otherwise(0.0))
        teams = groups.group_by("team").agg(
            freed_team=pl.col("freed_pos").sum(), pos_dist_team=pl.col("pos_dist").sum(), healthy_team=pl.col("healthy_pos").sum()
        ).with_columns(remaining=pl.col("freed_team") - pl.col("pos_dist_team"))
        d = d.join(groups, on=["team", "position"], how="left").join(teams, on="team", how="left")
        same = pl.when(pl.col("healthy_pos") > 0).then(pl.col("pos_dist") * pl.col("_base") / pl.col("healthy_pos")).otherwise(0.0)
        other = pl.when(pl.col("healthy_team") > 0).then(pl.col("remaining") * pl.col("_base") / pl.col("healthy_team")).otherwise(0.0)
        new = pl.when(pl.col("is_out")).then(0.0).otherwise(pl.col("_base") + same + other)
        return d.with_columns(new.alias(f"{col}_adj")).drop(
            ["_base", "freed_pos", "healthy_pos", "pos_dist", "freed_team", "pos_dist_team", "healthy_team", "remaining"]
        )

    df = redistribute("weighted_target_share")
    df = redistribute("weighted_carry_share")
    return df.with_columns(
        injury_adj=pl.when(pl.col("is_out")).then(0.0)
        .when(pl.col("weighted_target_share").fill_null(0) > 0)
        .then(pl.col("weighted_target_share_adj") / pl.col("weighted_target_share"))
        .otherwise(1.0)
    )


# --------------------------------------------------------------------------- driver

def build_projections(
    pwu: pl.DataFrame, team_ctx: pl.DataFrame, injuries: pl.DataFrame, season: int, week: int, run_id: str | None = None,
) -> pl.DataFrame:
    run_id = run_id or dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    volume = project_team_volume(team_ctx, season, week)
    if volume.height == 0:
        log.warning("no schedule rows for %s week %s; skipping projections", season, week)
        return pl.DataFrame()
    shares = weighted_shares(pwu, season, week)
    shares = injury_adjustments(shares, injuries, season, week)
    matchup = matchup_adjustments(pwu, season, week)
    grp = pl.when(pl.col("position").is_in(["RB", "FB"])).then(pl.lit("RB")).otherwise(pl.col("position"))

    df = (
        shares.join(volume, on="team", how="inner")
        .with_columns(pos_grp=grp)
        .join(matchup.rename({"position": "pos_grp"}), on=["opponent", "pos_grp"], how="left")
        .with_columns(matchup_adj=pl.col("matchup_adj").fill_null(1.0))
    )
    # carries: RB share of team RB carries (~88% of rush attempts); non-RBs get their own carry rate
    rb_share_of_rushes = 0.88
    df = df.with_columns(
        proj_targets=pl.col("proj_pass_attempts") * pl.col("weighted_target_share_adj") * pl.col("matchup_adj"),
        proj_carries=pl.when(pl.col("position").is_in(["RB", "FB"]))
        .then(pl.col("proj_rush_attempts") * rb_share_of_rushes * pl.col("weighted_carry_share_adj"))
        .otherwise(None),
    ).with_columns(
        proj_targets_low=pl.col("proj_targets") * RANGE_LOW,
        proj_targets_high=pl.col("proj_targets") * RANGE_HIGH,
        proj_carries_low=pl.col("proj_carries") * RANGE_LOW,
        proj_carries_high=pl.col("proj_carries") * RANGE_HIGH,
        season=pl.lit(season, dtype=pl.Int32),
        week=pl.lit(week, dtype=pl.Int32),
        run_id=pl.lit(run_id),
        is_latest=pl.lit(True),
    )
    df = df.filter((pl.col("proj_targets").fill_null(0) >= 0.5) | (pl.col("proj_carries").fill_null(0) >= 0.5))
    return df.select(
        "season", "week", "gsis_id", "run_id", "team", "opponent", "position",
        "proj_targets", "proj_carries", "proj_pass_attempts", "proj_rush_attempts",
        pl.col("weighted_target_share_adj").alias("weighted_target_share"),
        pl.col("weighted_carry_share_adj").alias("weighted_carry_share"),
        "injury_adj", "matchup_adj",
        "proj_targets_low", "proj_targets_high", "proj_carries_low", "proj_carries_high", "is_latest",
    )


def score_projections(proj: pl.DataFrame, pwu: pl.DataFrame) -> pl.DataFrame:
    """MAE of latest projections vs actuals for weeks that have been played."""
    latest = proj.filter(pl.col("is_latest"))
    joined = latest.join(
        pwu.select(["season", "week", "gsis_id", "targets", "carries"]), on=["season", "week", "gsis_id"], how="inner"
    )
    if joined.height == 0:
        return pl.DataFrame()
    return joined.group_by(["season", "week", "run_id"]).agg(
        n_players=pl.len(),
        mae_targets=(pl.col("proj_targets") - pl.col("targets")).abs().mean(),
        mae_carries=(pl.col("proj_carries") - pl.col("carries")).abs().filter(pl.col("proj_carries").is_not_null()).mean(),
    )
