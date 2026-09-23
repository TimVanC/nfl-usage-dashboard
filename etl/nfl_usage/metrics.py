"""Compute player_week_usage and team_week_context from nflverse frames.

All metrics follow the definitions in the PRD metrics catalog. Everything here is
pure polars: frames in, frames out, no I/O.
"""

from __future__ import annotations

import logging

import polars as pl

from .config import BACKFIELD_POSITIONS, FIRST_READ_VALUES, SKILL_POSITIONS

log = logging.getLogger(__name__)


# --------------------------------------------------------------------------- helpers

def _safe_div(num: str, den: str) -> pl.Expr:
    return (
        pl.when(pl.col(den) > 0)
        .then(pl.col(num).cast(pl.Float64) / pl.col(den))
        .otherwise(None)
    )


def _real_plays(pbp: pl.DataFrame) -> pl.DataFrame:
    """Pass and run plays that count in official stats (no 2pt, no deleted plays)."""
    return pbp.filter(
        pl.col("play_type").is_in(["pass", "run", "qb_kneel"])
        & (pl.col("play_deleted").fill_null(0) == 0)
        & (pl.col("two_point_attempt").fill_null(0) == 0)
    )


def player_positions(rosters: pl.DataFrame, players: pl.DataFrame) -> pl.DataFrame:
    """(season, week, gsis_id) -> position/team/headshot, falling back to the players table."""
    return rosters.select(
        ["season", "week", "gsis_id", "team", "position", "headshot_url", "full_name"]
    ).unique(subset=["season", "week", "gsis_id"], keep="last")


# --------------------------------------------------------------------------- receiving / rushing

def _targets(plays: pl.DataFrame, ftn: pl.DataFrame) -> pl.DataFrame:
    t = plays.filter((pl.col("play_type") == "pass") & pl.col("receiver_player_id").is_not_null())
    t = t.join(
        ftn.rename({"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
        .with_columns(pl.col("play_id").cast(pl.Float64)),
        on=["game_id", "play_id"],
        how="left",
    )
    ay = pl.col("air_yards").fill_null(0)
    t = t.with_columns(
        is_first_read=pl.col("read_thrown").is_in(list(FIRST_READ_VALUES)).cast(pl.Int32),
        has_ftn=pl.col("read_thrown").is_not_null(),
        is_rz=(pl.col("yardline_100") <= 20).cast(pl.Int32),
        is_ez=(ay >= pl.col("yardline_100")).cast(pl.Int32),
        rec=pl.col("complete_pass").fill_null(0).cast(pl.Int32),
        rec_yds=pl.col("receiving_yards").fill_null(0).cast(pl.Int32),
        rec_td=pl.col("pass_touchdown").fill_null(0).cast(pl.Int32),
        air=ay.cast(pl.Int32),
    )
    # game-level FTN coverage: a game is "pending" when no FTN rows exist for it
    ftn_cov = t.group_by("game_id").agg(pl.col("has_ftn").any().alias("game_has_ftn"))
    t = t.join(ftn_cov, on="game_id", how="left")

    per_player = t.group_by(["season", "week", "game_id", "posteam", "receiver_player_id"]).agg(
        targets=pl.len(),
        receptions=pl.col("rec").sum(),
        rec_yards=pl.col("rec_yds").sum(),
        rec_tds=pl.col("rec_td").sum(),
        air_yards=pl.col("air").sum(),
        first_read_targets=pl.col("is_first_read").sum(),
        rz_targets=pl.col("is_rz").sum(),
        ez_targets=pl.col("is_ez").sum(),
        ftn_pending=~pl.col("game_has_ftn").first(),
    ).rename({"posteam": "team", "receiver_player_id": "gsis_id"})

    per_team = t.group_by(["season", "week", "posteam"]).agg(
        team_targets=pl.len(),
        team_air_yards=pl.col("air").sum(),
        team_first_read_targets=pl.col("is_first_read").sum(),
    ).rename({"posteam": "team"})
    return per_player, per_team


def _carries(plays: pl.DataFrame) -> pl.DataFrame:
    # kneels count toward rushing yards in official stats but not as carries
    r = plays.filter(pl.col("play_type").is_in(["run", "qb_kneel"]) & pl.col("rusher_player_id").is_not_null())
    r = r.with_columns(
        is_carry=(pl.col("play_type") == "run").cast(pl.Int32),
        is_rz=((pl.col("yardline_100") <= 20) & (pl.col("play_type") == "run")).cast(pl.Int32),
        is_i5=((pl.col("yardline_100") <= 5) & (pl.col("play_type") == "run")).cast(pl.Int32),
        yds=pl.col("rushing_yards").fill_null(0).cast(pl.Int32),
        td=pl.col("rush_touchdown").fill_null(0).cast(pl.Int32),
    )
    per_player = r.group_by(["season", "week", "game_id", "posteam", "rusher_player_id"]).agg(
        carries=pl.col("is_carry").sum(),
        rush_yards=pl.col("yds").sum(),
        rush_tds=pl.col("td").sum(),
        rz_carries=pl.col("is_rz").sum(),
        inside5_carries=pl.col("is_i5").sum(),
    ).rename({"posteam": "team", "rusher_player_id": "gsis_id"})
    per_team = r.group_by(["season", "week", "posteam"]).agg(team_carries=pl.col("is_carry").sum()).rename({"posteam": "team"})
    return per_player, per_team


# --------------------------------------------------------------------------- snaps

def _snaps(snaps: pl.DataFrame, players: pl.DataFrame) -> pl.DataFrame:
    """Offensive snaps per player-week, mapped pfr_player_id -> gsis_id."""
    id_map = players.select(["pfr_id", "gsis_id"]).filter(pl.col("pfr_id").is_not_null()).unique("pfr_id")
    s = snaps.join(id_map, left_on="pfr_player_id", right_on="pfr_id", how="left")
    missing = s.filter(pl.col("gsis_id").is_null() & (pl.col("offense_snaps") > 0)).height
    if missing:
        log.warning("snap counts: %d offensive rows without gsis_id mapping", missing)
    s = s.filter(pl.col("gsis_id").is_not_null())
    team_snaps = (
        s.filter(pl.col("offense_pct") > 0)
        .with_columns((pl.col("offense_snaps") / pl.col("offense_pct")).round().cast(pl.Int32).alias("ts"))
        .group_by(["season", "week", "team"])
        .agg(team_snaps=pl.col("ts").max())
    )
    return (
        s.select(["season", "week", "team", "opponent", "gsis_id", "position", "offense_snaps"])
        .rename({"offense_snaps": "snaps", "position": "snap_position"})
        .join(team_snaps, on=["season", "week", "team"], how="left")
    )


# --------------------------------------------------------------------------- participation (routes proxy)

def _participation(part: pl.DataFrame | None, plays: pl.DataFrame) -> pl.DataFrame | None:
    if part is None or part.height == 0:
        return None
    keyed = plays.select(
        ["game_id", "play_id", "season", "week", "posteam", "qb_dropback", "pass", "rush", "down", "half_seconds_remaining"]
    ).with_columns(pl.col("play_id").cast(pl.Float64))
    p = part.rename({"nflverse_game_id": "game_id"}).with_columns(pl.col("play_id").cast(pl.Float64))
    p = p.join(keyed, on=["game_id", "play_id"], how="inner")
    p = p.with_columns(
        pl.col("offense_players").str.split(";").alias("players"),
        is_db=pl.col("qb_dropback").fill_null(0).cast(pl.Int32),
        is_pass=pl.col("pass").fill_null(0).cast(pl.Int32),
        is_run=pl.col("rush").fill_null(0).cast(pl.Int32),
        is_pd=((pl.col("down") == 3) | (pl.col("half_seconds_remaining") <= 120)).cast(pl.Int32),
    ).explode("players").filter(pl.col("players").str.len_chars() > 0)
    per_player = p.group_by(["season", "week", "posteam", "players"]).agg(
        routes_proxy=pl.col("is_db").sum(),
        pass_snaps=pl.col("is_pass").sum(),
        run_snaps=pl.col("is_run").sum(),
        passing_down_snaps=pl.col("is_pd").sum(),
    ).rename({"posteam": "team", "players": "gsis_id"})
    return per_player


# --------------------------------------------------------------------------- assembly

def build_player_week_usage(
    pbp: pl.DataFrame,
    snaps: pl.DataFrame,
    ftn: pl.DataFrame,
    part: pl.DataFrame | None,
    rosters: pl.DataFrame,
    players: pl.DataFrame,
    schedules: pl.DataFrame,
) -> pl.DataFrame:
    plays = _real_plays(pbp)
    tgt_p, tgt_t = _targets(plays, ftn)
    car_p, car_t = _carries(plays)
    snap_p = _snaps(snaps, players)
    part_p = _participation(part, plays)

    team_db = (
        plays.filter(pl.col("qb_dropback") == 1)
        .group_by(["season", "week", "posteam"]).agg(team_dropbacks=pl.len())
        .rename({"posteam": "team"})
    )

    keys = ["season", "week", "team", "gsis_id"]
    base = (
        tgt_p.select(keys + ["game_id"])
        .vstack(car_p.select(keys + ["game_id"]))
        .unique(keys)
    )
    snap_keys = snap_p.select(keys).with_columns(pl.lit(None, dtype=pl.Utf8).alias("game_id"))
    base = pl.concat([base, snap_keys]).unique(keys, keep="first")

    df = (
        base.join(tgt_p.drop("game_id"), on=keys, how="left")
        .join(car_p.drop("game_id"), on=keys, how="left")
        .join(snap_p, on=keys, how="left")
        .join(tgt_t, on=["season", "week", "team"], how="left")
        .join(car_t, on=["season", "week", "team"], how="left")
        .join(team_db, on=["season", "week", "team"], how="left")
    )
    if part_p is not None:
        df = df.join(part_p, on=keys, how="left")
    else:
        df = df.with_columns(
            pl.lit(None, dtype=pl.Int64).alias(c) for c in ["routes_proxy", "pass_snaps", "run_snaps", "passing_down_snaps"]
        )

    # position / headshot / name from weekly rosters, then players table
    pos = player_positions(rosters, players)
    df = df.join(pos.drop(["team"]), on=["season", "week", "gsis_id"], how="left")
    df = df.join(
        players.select(["gsis_id", "position", "display_name"]).rename({"position": "p_pos", "display_name": "p_name"}),
        on="gsis_id", how="left",
    ).with_columns(
        position=pl.coalesce(["position", "snap_position", "p_pos"]),
        name=pl.coalesce(["full_name", "p_name"]),
    )

    # fill game_id / opponent from schedule for snap-only rows
    sched = schedules.filter(pl.col("game_type") == "REG")
    home = sched.select(["season", "week", "game_id", pl.col("home_team").alias("team"), pl.col("away_team").alias("opp")])
    away = sched.select(["season", "week", "game_id", pl.col("away_team").alias("team"), pl.col("home_team").alias("opp")])
    team_games = pl.concat([home, away]).rename({"game_id": "sched_game_id"})
    df = df.join(team_games, on=["season", "week", "team"], how="left").with_columns(
        game_id=pl.coalesce(["game_id", "sched_game_id"]),
        opponent=pl.coalesce(["opponent", "opp"]),
    ).drop(["sched_game_id", "opp"])

    # keep skill positions or anyone with a touch
    df = df.filter(
        pl.col("position").is_in(list(SKILL_POSITIONS))
        | (pl.col("targets").fill_null(0) > 0)
        | (pl.col("carries").fill_null(0) > 0)
    )

    int_zero = [
        "targets", "receptions", "rec_yards", "rec_tds", "air_yards", "rz_targets", "ez_targets",
        "carries", "rush_yards", "rush_tds", "rz_carries", "inside5_carries",
        "team_targets", "team_air_yards", "team_carries",
    ]
    df = df.with_columns([pl.col(c).fill_null(0).cast(pl.Int32) for c in int_zero])
    df = df.with_columns(
        ftn_pending=pl.col("ftn_pending").fill_null(True),
        first_read_targets=pl.when(pl.col("ftn_pending")).then(None).otherwise(pl.col("first_read_targets").fill_null(0)),
        team_first_read_targets=pl.when(pl.col("ftn_pending")).then(None).otherwise(pl.col("team_first_read_targets").fill_null(0)),
    )

    # backfield denominators: team RB carries / RB targets
    is_rb = pl.col("position").is_in(list(BACKFIELD_POSITIONS))
    rb_team = df.filter(is_rb).group_by(["season", "week", "team"]).agg(
        team_rb_carries=pl.col("carries").sum(), team_rb_targets=pl.col("targets").sum()
    )
    df = df.join(rb_team, on=["season", "week", "team"], how="left").with_columns(
        pl.col("team_rb_carries").fill_null(0), pl.col("team_rb_targets").fill_null(0)
    )

    df = df.with_columns(
        snap_pct=_safe_div("snaps", "team_snaps"),
        target_share=_safe_div("targets", "team_targets"),
        air_yards_share=_safe_div("air_yards", "team_air_yards"),
        adot=_safe_div("air_yards", "targets"),
        first_read_share=_safe_div("first_read_targets", "team_first_read_targets"),
        route_pct=_safe_div("routes_proxy", "team_dropbacks"),
        tprr_proxy=_safe_div("targets", "routes_proxy"),
        carry_share=pl.when(is_rb).then(_safe_div("carries", "team_rb_carries")).otherwise(None),
        rb_target_share=pl.when(is_rb).then(_safe_div("targets", "team_rb_targets")).otherwise(None),
        passing_down_snaps=pl.when(is_rb).then(pl.col("passing_down_snaps")).otherwise(None),
    ).with_columns(
        wopr=(1.5 * pl.col("target_share").fill_null(0) + 0.7 * pl.col("air_yards_share").fill_null(0)),
        fantasy_points_ppr=(
            pl.col("rec_yards") * 0.1 + pl.col("rec_tds") * 6 + pl.col("receptions")
            + pl.col("rush_yards") * 0.1 + pl.col("rush_tds") * 6
        ),
    )

    out_cols = [
        "season", "week", "gsis_id", "game_id", "team", "opponent", "position",
        "snaps", "team_snaps", "snap_pct",
        "targets", "team_targets", "target_share", "receptions", "rec_yards", "rec_tds",
        "air_yards", "team_air_yards", "air_yards_share", "wopr", "adot",
        "first_read_targets", "team_first_read_targets", "first_read_share", "ftn_pending",
        "rz_targets", "ez_targets", "routes_proxy", "team_dropbacks", "route_pct", "tprr_proxy",
        "pass_snaps", "run_snaps",
        "carries", "rush_yards", "rush_tds", "team_carries", "team_rb_carries", "carry_share",
        "team_rb_targets", "rb_target_share", "rz_carries", "inside5_carries", "passing_down_snaps",
        "fantasy_points_ppr",
    ]
    return df.select(out_cols).sort(["season", "week", "team", "gsis_id"])


def build_team_week_context(pbp: pl.DataFrame, schedules: pl.DataFrame) -> pl.DataFrame:
    plays = _real_plays(pbp).filter(pl.col("play_type") != "qb_kneel")
    # neutral = win probability 20-80%; fall back to one-score games when wp is missing
    wp = pl.coalesce(["vegas_wp", "wp"])
    neutral = pl.when(wp.is_not_null()).then((wp >= 0.2) & (wp <= 0.8)).otherwise(
        pl.col("score_differential").fill_null(0).abs() <= 8
    )

    # pace: seconds between consecutive offensive snaps within a drive, neutral situations
    pace_src = (
        plays.sort(["game_id", "drive", "play_id"])
        .with_columns(
            gap=(pl.col("game_seconds_remaining").shift(1).over(["game_id", "posteam", "drive"]) - pl.col("game_seconds_remaining")),
            neutral=neutral,
        )
        .filter(pl.col("neutral") & (pl.col("gap") > 0) & (pl.col("gap") <= 60))
        .group_by(["season", "week", "posteam"]).agg(pace=pl.col("gap").mean())
    )

    ctx = plays.with_columns(neutral=neutral).group_by(["season", "week", "posteam"]).agg(
        plays=pl.len(),
        pass_attempts=((pl.col("play_type") == "pass") & (pl.col("sack").fill_null(0) == 0)).sum(),
        dropbacks=(pl.col("qb_dropback") == 1).sum(),
        rush_attempts=((pl.col("play_type") == "run") & (pl.col("qb_scramble").fill_null(0) == 0)).sum(),
        pass_rate=pl.col("pass").mean(),
        neutral_pass_rate=pl.col("pass").filter(pl.col("neutral")).mean(),
        proe=(pl.col("pass") - pl.col("xpass")).filter(pl.col("xpass").is_not_null()).mean(),
    ).rename({"posteam": "team"}).join(pace_src.rename({"posteam": "team"}), on=["season", "week", "team"], how="left")

    sched = schedules.filter(pl.col("game_type") == "REG")
    home = sched.select(
        "season", "week", "game_id",
        pl.col("home_team").alias("team"), pl.col("away_team").alias("opponent"),
        pl.lit(True).alias("is_home"),
        pl.col("home_score").alias("points_for"), pl.col("away_score").alias("points_against"),
        (-pl.col("spread_line")).alias("spread_line"), pl.col("total_line"),
    )
    away = sched.select(
        "season", "week", "game_id",
        pl.col("away_team").alias("team"), pl.col("home_team").alias("opponent"),
        pl.lit(False).alias("is_home"),
        pl.col("away_score").alias("points_for"), pl.col("home_score").alias("points_against"),
        pl.col("spread_line").alias("spread_line"), pl.col("total_line"),
    )
    tg = pl.concat([home, away]).with_columns(
        implied_total=(pl.col("total_line") / 2 - pl.col("spread_line") / 2)
    )
    out = tg.join(ctx, on=["season", "week", "team"], how="left")
    return out.select(
        "season", "week", "team", "opponent", "game_id", "is_home", "points_for", "points_against",
        "plays", "pass_attempts", "dropbacks", "rush_attempts", "pass_rate", "neutral_pass_rate", "proe",
        "pace", "spread_line", "total_line", "implied_total",
    ).sort(["season", "week", "team"])
