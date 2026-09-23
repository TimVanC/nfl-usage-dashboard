"""NFL Usage Dashboard ETL.

Usage:
  python run_etl.py --init-db                 # apply db/schema.sql
  python run_etl.py                           # current season, all steps
  python run_etl.py --seasons 2022 2023 2024 2025 2026
  python run_etl.py --projections-only        # rerun projections (Fri/Sun injury refresh)
  python run_etl.py --validate                # also compare against nflverse box scores
"""

from __future__ import annotations

import argparse
import datetime as dt
import logging
import sys

import polars as pl
from dotenv import load_dotenv

from nfl_usage import aggregate, db, load, metrics, projections, sleeper, validate
from nfl_usage.config import current_season

log = logging.getLogger("etl")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--seasons", nargs="*", type=int, default=None)
    p.add_argument("--init-db", action="store_true")
    p.add_argument("--validate", action="store_true")
    p.add_argument("--projections-only", action="store_true")
    p.add_argument("--skip-projections", action="store_true")
    p.add_argument("--skip-sleeper", action="store_true")
    return p.parse_args()


def load_reference(conn, seasons: list[int], skip_sleeper: bool) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    teams = load.load_teams().rename({
        "team_abbr": "abbr", "team_name": "name", "team_nick": "nick", "team_conf": "conference",
        "team_division": "division", "team_color": "color", "team_color2": "color2", "team_logo_espn": "logo_url",
    })
    db.upsert(conn, "teams", teams, ["abbr"])

    players = load.load_players()
    rosters = load.load_rosters_weekly(seasons)
    sched = load.load_schedules(seasons)

    # players table: latest weekly roster row wins for team/position/headshot
    latest_roster = (
        rosters.sort(["season", "week"]).group_by("gsis_id")
        .agg(pl.col("team").last(), pl.col("position").last(), pl.col("headshot_url").last(), pl.col("full_name").last(), pl.col("sleeper_id").last())
    )
    pdf = players.join(latest_roster, on="gsis_id", how="left", suffix="_r").select(
        "gsis_id",
        pl.coalesce(["full_name", "display_name"]).alias("name"),
        "short_name",
        pl.coalesce(["position_r", "position"]).alias("position"),
        pl.coalesce(["team", "latest_team"]).alias("team"),
        pl.coalesce(["headshot_url", "headshot"]).alias("headshot_url"),
        "sleeper_id",
    )
    sleeper_df = None
    if not skip_sleeper:
        sleeper_df = sleeper.fetch_sleeper_players()
        if sleeper_df.height:
            pdf = pdf.join(sleeper_df.select(["gsis_id", "sleeper_id"]), on="gsis_id", how="left", suffix="_s").with_columns(
                sleeper_id=pl.coalesce(["sleeper_id_s", "sleeper_id"])
            ).drop("sleeper_id_s")
    pdf = pdf.with_columns(updated_at=pl.lit(dt.datetime.now(dt.timezone.utc)))
    db.upsert(conn, "players", pdf, ["gsis_id"])

    games = sched.with_columns(
        completed=pl.col("home_score").is_not_null() & pl.col("away_score").is_not_null(),
        gameday=pl.col("gameday").cast(pl.Utf8),
    )
    db.upsert(conn, "games", games, ["game_id"])
    return players, rosters, sched, sleeper_df


def write_injuries(conn, seasons: list[int], sleeper_df: pl.DataFrame | None, sched: pl.DataFrame, pwu: pl.DataFrame) -> pl.DataFrame:
    inj = load.load_injuries(seasons)
    inj = inj.rename({"report_primary_injury": "primary_injury"}) if inj.height else inj
    if inj.height == 0:
        inj = pl.DataFrame(schema={"season": pl.Int32, "week": pl.Int32, "team": pl.Utf8, "gsis_id": pl.Utf8,
                                   "position": pl.Utf8, "report_status": pl.Utf8, "practice_status": pl.Utf8, "primary_injury": pl.Utf8})
    inj = inj.with_columns(sleeper_status=pl.lit(None, dtype=pl.Utf8))

    # Sleeper live status is attached to the *next* week of the current season for every active skill player
    season = max(seasons)
    if sleeper_df is not None and sleeper_df.height:
        latest = pwu.filter(pl.col("season") == season)["week"].max() or 0
        nxt = latest + 1
        active = pwu.filter(pl.col("season") == season).group_by("gsis_id").agg(pl.col("team").last(), pl.col("position").last())
        live = active.join(sleeper_df.filter(pl.col("sleeper_status").is_not_null()), on="gsis_id", how="inner").select(
            pl.lit(season, dtype=pl.Int32).alias("season"), pl.lit(nxt, dtype=pl.Int32).alias("week"),
            "team", "gsis_id", "position",
            pl.lit(None, dtype=pl.Utf8).alias("report_status"), pl.lit(None, dtype=pl.Utf8).alias("practice_status"),
            pl.lit(None, dtype=pl.Utf8).alias("primary_injury"), "sleeper_status",
        )
        inj = pl.concat([inj.select(live.columns).with_columns(pl.col("season").cast(pl.Int32), pl.col("week").cast(pl.Int32)), live], how="vertical_relaxed")
        # merge duplicates: keep official report fields and add sleeper status
        inj = inj.group_by(["season", "week", "gsis_id"]).agg(
            pl.col("team").drop_nulls().last(), pl.col("position").drop_nulls().last(),
            pl.col("report_status").drop_nulls().last(), pl.col("practice_status").drop_nulls().last(),
            pl.col("primary_injury").drop_nulls().last(), pl.col("sleeper_status").drop_nulls().last(),
        )
    inj = inj.unique(["season", "week", "gsis_id"]).with_columns(updated_at=pl.lit(dt.datetime.now(dt.timezone.utc)))
    db.upsert(conn, "injuries", inj, ["season", "week", "gsis_id"])
    return inj


def run_projections(conn, season: int, pwu: pl.DataFrame, team_ctx: pl.DataFrame, injuries: pl.DataFrame) -> None:
    latest = pwu.filter(pl.col("season") == season)["week"].max()
    if latest is None:
        log.info("no completed weeks for %s; skipping projections", season)
        return
    week = int(latest) + 1
    proj = projections.build_projections(pwu, team_ctx, injuries, season, week)
    if proj.height == 0:
        return
    db.execute(conn, "update projections set is_latest = false where season = %s and week = %s", (season, week))
    proj = proj.with_columns(run_at=pl.lit(dt.datetime.now(dt.timezone.utc)))
    db.upsert(conn, "projections", proj, ["season", "week", "gsis_id", "run_id"])
    log.info("projections: %s week %s, %d players", season, week, proj.height)

    # score previous weeks' latest projections against actuals
    prev = db.read_df(conn, "select season, week, gsis_id, run_id, proj_targets, proj_carries, is_latest from projections where season = %s and is_latest", (season,))
    if prev.height:
        prev = prev.with_columns(pl.col("proj_targets").cast(pl.Float64), pl.col("proj_carries").cast(pl.Float64), pl.col("season").cast(pl.Int32), pl.col("week").cast(pl.Int32))
        acc = projections.score_projections(prev, pwu)
        if acc.height:
            db.upsert(conn, "projection_accuracy", acc, ["season", "week", "run_id"])


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    load_dotenv()
    args = parse_args()
    seasons = sorted(args.seasons or [current_season()])
    season = max(seasons)

    conn = db.connect()
    if args.init_db:
        db.init_schema(conn)

    with conn.cursor() as cur:
        cur.execute("insert into etl_runs (seasons) values (%s) returning id", (seasons,))
        run_row = cur.fetchone()[0]
    conn.commit()

    try:
        if args.projections_only:
            pwu = db.read_df(conn, "select * from player_week_usage where season = %s", (season,))
            ctx = db.read_df(conn, "select * from team_week_context where season in (%s, %s)", (season, season - 1))
            inj = db.read_df(conn, "select * from injuries where season = %s", (season,))
            num = lambda df: df.with_columns([pl.col(c).cast(pl.Float64) for c, t in df.schema.items() if t == pl.Decimal])  # noqa: E731
            pwu, ctx, inj = num(pwu), num(ctx), num(inj)
            # refresh Sleeper status before projecting
            if not args.skip_sleeper:
                sl = sleeper.fetch_sleeper_players()
                sched = load.load_schedules([season])
                inj = write_injuries(conn, [season], sl, sched, pwu)
            run_projections(conn, season, pwu, ctx, inj)
        else:
            players, rosters, sched, sleeper_df = load_reference(conn, seasons, args.skip_sleeper)
            pbp = load.load_pbp(seasons)
            snaps = load.load_snaps(seasons)
            ftn = load.load_ftn(seasons)
            part = load.load_participation(seasons)

            pwu = metrics.build_player_week_usage(pbp, snaps, ftn, part, rosters, players, sched)
            ctx = metrics.build_team_week_context(pbp, sched)
            db.upsert(conn, "player_week_usage", pwu.with_columns(updated_at=pl.lit(dt.datetime.now(dt.timezone.utc))), ["season", "week", "gsis_id"])
            db.upsert(conn, "team_week_context", ctx.with_columns(updated_at=pl.lit(dt.datetime.now(dt.timezone.utc))), ["season", "week", "team"])

            psu = aggregate.build_player_season_usage(pwu, ctx)
            db.upsert(conn, "player_season_usage", psu.with_columns(updated_at=pl.lit(dt.datetime.now(dt.timezone.utc))), ["season", "scope", "gsis_id"],
                      delete_where=f"season in ({', '.join(str(s) for s in seasons)})")

            inj = write_injuries(conn, seasons, sleeper_df, sched, pwu)

            if args.validate:
                box = load.load_box_scores(seasons)
                summary = validate.validate_against_box(pwu, box)
                if not summary["ok"]:
                    log.error("validation failed: %s", summary)

            if not args.skip_projections:
                # team_ctx needs prior season for early-season blending
                ctx_all = ctx
                if season - 1 not in seasons:
                    prev = db.read_df(conn, "select * from team_week_context where season = %s", (season - 1,))
                    if prev.height:
                        prev = prev.with_columns([pl.col(c).cast(pl.Float64) for c, t in prev.schema.items() if t == pl.Decimal]).select(ctx.columns)
                        ctx_all = pl.concat([ctx, prev.cast(ctx.schema)], how="vertical_relaxed")
                run_projections(conn, season, pwu, ctx_all, inj)

        latest_week = db.read_df(conn, "select latest_week from season_status where season = %s", (season,))
        lw = int(latest_week["latest_week"][0]) if latest_week.height and latest_week["latest_week"][0] is not None else None
        db.execute(conn, "update etl_runs set finished_at = now(), status = 'ok', latest_week = %s where id = %s", (lw, run_row))
        log.info("done. latest completed week for %s: %s", season, lw)
        return 0
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        db.execute(conn, "update etl_runs set finished_at = now(), status = 'error', notes = %s where id = %s", (str(e)[:2000], run_row))
        log.exception("ETL failed")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
