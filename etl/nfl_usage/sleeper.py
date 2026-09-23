"""Sleeper public API: live injury status and player id mapping (no key needed)."""

from __future__ import annotations

import logging
import time

import polars as pl
import requests

log = logging.getLogger(__name__)

PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"


def fetch_sleeper_players(retries: int = 3) -> pl.DataFrame:
    """Returns gsis_id, sleeper_id, sleeper_status, sleeper_team for players with a gsis_id."""
    for attempt in range(retries):
        try:
            r = requests.get(PLAYERS_URL, timeout=60)
            r.raise_for_status()
            data = r.json()
            break
        except Exception as e:  # noqa: BLE001
            log.warning("sleeper players fetch failed (%s/%s): %s", attempt + 1, retries, e)
            time.sleep(2 * (attempt + 1))
    else:
        return pl.DataFrame(schema={"gsis_id": pl.Utf8, "sleeper_id": pl.Utf8, "sleeper_status": pl.Utf8, "sleeper_team": pl.Utf8})

    rows = []
    for sid, p in data.items():
        gsis = p.get("gsis_id")
        if not gsis:
            continue
        rows.append({
            "gsis_id": gsis.strip(),
            "sleeper_id": str(sid),
            "sleeper_status": p.get("injury_status"),
            "sleeper_team": p.get("team"),
        })
    schema = {"gsis_id": pl.Utf8, "sleeper_id": pl.Utf8, "sleeper_status": pl.Utf8, "sleeper_team": pl.Utf8}
    df = pl.DataFrame(rows, schema=schema).unique("gsis_id")
    log.info("sleeper: %d players mapped, %d with injury status", df.height, df["sleeper_status"].is_not_null().sum())
    return df
