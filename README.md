# NFL Usage Dashboard

Target share, first-read share, backfield splits, red zone usage and next-week volume projections for every NFL team, built entirely on free data (nflverse + FTN charting via nflverse + Sleeper).

```
nflverse / FTN / Sleeper ──▶ etl/ (Python, polars) ──▶ Neon Postgres ──▶ web/ (Next.js on Vercel) ──▶ PNG export
```

## Layout

| Path | What |
|---|---|
| `db/schema.sql` | Postgres schema (idempotent; applied by `run_etl.py --init-db`) |
| `etl/` | Python ETL: loads nflverse data, computes usage metrics, aggregates, projections, writes to Neon |
| `web/` | Next.js 16 app: Team / Week / Season / Projections pages, player drawer, OG image export |
| `.github/workflows/etl.yml` | Cron: nightly Mon–Wed in season, plus Fri-night and Sun-morning projection reruns |

## Quick start

```bash
# 1. env
cp .env.example .env            # set DATABASE_URL (Neon connection string)
cp .env ./etl/.env
cp .env ./web/.env.local

# 2. ETL (Python 3.12+)
cd etl
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt
python run_etl.py --init-db --seasons 2022 2023 2024 2025 2026 --validate

# 3. web
cd ../web
npm install
npm run dev
```

### ETL commands

```bash
python run_etl.py                         # current season, all steps
python run_etl.py --validate              # also compare against nflverse box scores (targets/carries/yards)
python run_etl.py --projections-only      # refresh Sleeper injury status and rerun next-week projections
python run_etl.py --seasons 2024 2025     # backfill specific seasons
```

## Data notes

- **Regular season only.** Targets, carries, receptions and yards match nflverse box-score stats 100% (kneels count as rush yards but not carries, as in official stats).
- **First-read share** uses FTN `read_thrown ∈ {1, DES}`. Games not yet charted are flagged `ftn_pending` and shown as *pend.*; season/last-4 shares only use charted games.
- **Routes proxy** (team dropbacks with the player on the field) needs nflverse participation data, which ends after 2025. For 2026 route %, TPRR and passing-down snaps are null and the UI says so.
- **Team snaps** are inferred from the highest-snap player's `offense_pct` (PFR snap counts).
- **Neutral situations** = win probability 20–80% (vegas WP when available; one-score game otherwise).
- **Projections v1**: `ProjTargets = ProjPassAtt(team) × EWM share (6 games, decay 0.8, 70/30 blend with first-read share) × injury redistribution × matchup (targets allowed by position vs league avg, shrunk by n/(n+4))`. Team pass/rush attempts come from a least-squares fit on implied total, spread, neutral pass rate and pace. Accuracy (MAE vs actuals) is logged to `projection_accuracy` each run.

## Deploy

- **Neon**: create a project, copy the connection string into `DATABASE_URL`.
- **GitHub secrets**: `DATABASE_URL` (required), `REVALIDATE_URL` (optional: `https://<site>/api/revalidate?secret=<REVALIDATE_SECRET>`).
- **Vercel**: import the repo, set root directory to `web/`, env vars `DATABASE_URL`, `REVALIDATE_SECRET`, optional `NEXT_PUBLIC_AVATAR_SOURCE=headshot|initials`.

## Attribution

Play-by-play, snap counts, participation, rosters and schedules: [nflverse](https://github.com/nflverse). Charting data: FTN Data via nflverse, CC BY-SA 4.0. Injury status: Sleeper API. Not affiliated with the NFL.
