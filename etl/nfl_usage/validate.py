"""Validate computed usage against nflverse player-week box-score stats."""

from __future__ import annotations

import logging

import polars as pl

log = logging.getLogger(__name__)

CHECKS = [
    ("targets", "targets"),
    ("receptions", "receptions"),
    ("rec_yards", "receiving_yards"),
    ("carries", "carries"),
    ("rush_yards", "rushing_yards"),
]


def validate_against_box(pwu: pl.DataFrame, box: pl.DataFrame) -> dict:
    """Compare per player-week counts. Returns a summary dict; logs mismatches."""
    b = box.rename({"player_id": "gsis_id"})
    j = pwu.join(b, on=["season", "week", "gsis_id"], how="inner", suffix="_box")
    summary = {"rows_compared": j.height}
    ok = True
    for ours, theirs in CHECKS:
        theirs_col = theirs if theirs in j.columns else f"{theirs}_box"
        diff = (j[ours].fill_null(0).cast(pl.Float64) - j[theirs_col].fill_null(0).cast(pl.Float64)).abs()
        mism = int((diff > 0).sum())
        summary[ours] = {"mismatches": mism, "max_abs_diff": float(diff.max() or 0), "pct_match": round(100 * (1 - mism / max(j.height, 1)), 2)}
        if mism / max(j.height, 1) > 0.02:
            ok = False
            bad = j.filter(diff > 0).select(["season", "week", "team", "gsis_id", ours, theirs_col]).head(10)
            log.warning("%s: %d mismatches (>2%%). Sample:\n%s", ours, mism, bad)
    # players with a box-score line but missing from our table
    missing = b.filter((pl.col("targets") > 0) | (pl.col("carries") > 0)).join(
        pwu.select(["season", "week", "gsis_id"]), on=["season", "week", "gsis_id"], how="anti"
    )
    summary["missing_players"] = missing.height
    summary["ok"] = ok and missing.height / max(b.height, 1) < 0.02
    log.info("validation: %s", summary)
    return summary
