import polars as pl

from nfl_usage.aggregate import build_player_season_usage
from nfl_usage.projections import injury_adjustments, weighted_shares


def _pwu():
    rows = []
    for week in range(1, 5):
        rows += [
            dict(season=2026, week=week, gsis_id="A", team="SEA", opponent="X", position="WR", snaps=50, team_snaps=60,
                 targets=10, team_targets=30, target_share=10 / 30, first_read_share=0.4, carry_share=None, inside5_carries=0,
                 receptions=6, rec_yards=80, rec_tds=1, air_yards=100, team_air_yards=250, rz_targets=1, ez_targets=0,
                 first_read_targets=4, team_first_read_targets=10, ftn_pending=False, routes_proxy=None, team_dropbacks=None,
                 carries=0, rush_yards=0, rush_tds=0, team_rb_carries=20, team_rb_targets=5, rz_carries=0, passing_down_snaps=None, fantasy_points_ppr=20.0),
            dict(season=2026, week=week, gsis_id="B", team="SEA", opponent="X", position="WR", snaps=40, team_snaps=60,
                 targets=5, team_targets=30, target_share=5 / 30, first_read_share=0.2, carry_share=None, inside5_carries=0,
                 receptions=3, rec_yards=40, rec_tds=0, air_yards=50, team_air_yards=250, rz_targets=0, ez_targets=0,
                 first_read_targets=2, team_first_read_targets=10, ftn_pending=False, routes_proxy=None, team_dropbacks=None,
                 carries=0, rush_yards=0, rush_tds=0, team_rb_carries=20, team_rb_targets=5, rz_carries=0, passing_down_snaps=None, fantasy_points_ppr=7.0),
            dict(season=2026, week=week, gsis_id="C", team="SEA", opponent="X", position="RB", snaps=30, team_snaps=60,
                 targets=5, team_targets=30, target_share=5 / 30, first_read_share=None, carry_share=0.75, inside5_carries=1,
                 receptions=4, rec_yards=30, rec_tds=0, air_yards=0, team_air_yards=250, rz_targets=0, ez_targets=0,
                 first_read_targets=0, team_first_read_targets=10, ftn_pending=False, routes_proxy=None, team_dropbacks=None,
                 carries=15, rush_yards=60, rush_tds=0, team_rb_carries=20, team_rb_targets=5, rz_carries=2, passing_down_snaps=None, fantasy_points_ppr=13.0),
        ]
    return pl.DataFrame(rows)


def test_weighted_share_blends_first_read():
    shares = weighted_shares(_pwu(), 2026, 5)
    a = shares.filter(pl.col("gsis_id") == "A").row(0, named=True)
    # 0.7 * 1/3 + 0.3 * 0.4
    assert abs(a["weighted_target_share"] - (0.7 * (10 / 30) + 0.3 * 0.4)) < 1e-9
    c = shares.filter(pl.col("gsis_id") == "C").row(0, named=True)
    assert abs(c["weighted_carry_share"] - 0.75) < 1e-9
    assert abs(c["weighted_target_share"] - 5 / 30) < 1e-9  # no first-read data -> plain EWM


def test_injury_redistribution_conserves_share():
    shares = weighted_shares(_pwu(), 2026, 5)
    injuries = pl.DataFrame({"season": [2026], "week": [5], "gsis_id": ["A"], "report_status": ["Out"], "sleeper_status": [None]}).with_columns(pl.col("sleeper_status").cast(pl.Utf8))
    adj = injury_adjustments(shares, injuries, 2026, 5)
    before = shares["weighted_target_share"].sum()
    after = adj["weighted_target_share_adj"].sum()
    assert abs(before - after) < 1e-9
    a = adj.filter(pl.col("gsis_id") == "A").row(0, named=True)
    assert a["weighted_target_share_adj"] == 0 and a["injury_adj"] == 0
    b = adj.filter(pl.col("gsis_id") == "B").row(0, named=True)
    assert b["injury_adj"] > 1


def test_season_and_last4_aggregates():
    pwu = _pwu()
    ctx = pl.DataFrame({"season": [2026] * 4, "team": ["SEA"] * 4, "week": [1, 2, 3, 4], "plays": [60] * 4})
    psu = build_player_season_usage(pwu, ctx)
    season = psu.filter((pl.col("scope") == "season") & (pl.col("gsis_id") == "A")).row(0, named=True)
    assert season["games"] == 4 and season["targets"] == 40
    assert abs(season["target_share"] - 40 / 120) < 1e-9
    assert abs(season["first_read_share"] - 16 / 40) < 1e-9
    last4 = psu.filter((pl.col("scope") == "last4") & (pl.col("gsis_id") == "C")).row(0, named=True)
    assert abs(last4["carry_share"] - 60 / 80) < 1e-9
