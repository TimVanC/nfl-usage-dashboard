"""Postgres (Neon) writer: schema init and COPY-based upserts."""

from __future__ import annotations

import io
import logging
import os
from pathlib import Path

import polars as pl
import psycopg

log = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "db" / "schema.sql"


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(url, autocommit=False)


def init_schema(conn: psycopg.Connection) -> None:
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    log.info("schema applied from %s", SCHEMA_PATH)


def _int_columns(conn: psycopg.Connection, table: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            "select column_name from information_schema.columns where table_name = %s and data_type in ('integer', 'bigint', 'smallint')",
            (table,),
        )
        return {r[0] for r in cur.fetchall()}


def _clean(df: pl.DataFrame, int_cols: set[str]) -> pl.DataFrame:
    """NaN -> null so COPY writes empty fields; floats bound for int columns are rounded."""
    exprs = []
    for name, dtype in df.schema.items():
        if dtype in (pl.Float32, pl.Float64):
            e = pl.when(pl.col(name).is_nan()).then(None).otherwise(pl.col(name))
            if name in int_cols:
                e = e.round().cast(pl.Int64)
            exprs.append(e.alias(name))
    return df.with_columns(exprs) if exprs else df


def upsert(conn: psycopg.Connection, table: str, df: pl.DataFrame, pk: list[str], delete_where: str | None = None) -> int:
    """COPY df into a temp table then INSERT ... ON CONFLICT (pk) DO UPDATE."""
    if df.height == 0:
        log.info("%s: nothing to write", table)
        return 0
    df = _clean(df, _int_columns(conn, table))
    cols = df.columns
    col_list = ", ".join(cols)
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c not in pk)
    tmp = f"tmp_{table}"
    buf = io.StringIO()
    df.write_csv(buf, include_header=False, null_value="")
    buf.seek(0)
    with conn.cursor() as cur:
        cur.execute(f"create temp table {tmp} (like {table} including defaults) on commit drop")
        with cur.copy(f"copy {tmp} ({col_list}) from stdin with (format csv, null '')") as cp:
            cp.write(buf.getvalue())
        if delete_where:
            cur.execute(f"delete from {table} where {delete_where}")
        cur.execute(
            f"insert into {table} ({col_list}) select {col_list} from {tmp} "
            f"on conflict ({', '.join(pk)}) do update set {updates}"
        )
        n = cur.rowcount
    conn.commit()
    log.info("%s: upserted %d rows", table, n)
    return n


def execute(conn: psycopg.Connection, sql: str, params: tuple | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


def read_df(conn: psycopg.Connection, sql: str, params: tuple | None = None) -> pl.DataFrame:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        cols = [d.name for d in cur.description]
        rows = cur.fetchall()
    return pl.DataFrame([dict(zip(cols, r)) for r in rows]) if rows else pl.DataFrame(schema={c: pl.Utf8 for c in cols})
