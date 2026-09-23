import { cache } from "react";
import { sql } from "./db";
import type { ProjectionRow, SeasonStatus, Team, TeamContext, UsageRow } from "./types";

const SKILL = ["QB", "RB", "WR", "TE", "FB"];

export const getSeasonStatus = cache(async (season?: number): Promise<SeasonStatus> => {
  const q = sql();
  const rows = season
    ? await q`select season, latest_week, scheduled_through from season_status where season = ${season}`
    : await q`select season, latest_week, scheduled_through from season_status where latest_week is not null order by season desc limit 1`;
  const run = await q`select finished_at from etl_runs where status = 'ok' order by finished_at desc limit 1`;
  const r = rows[0] ?? { season: season ?? new Date().getFullYear(), latest_week: 0, scheduled_through: 18 };
  return {
    season: Number(r.season),
    latest_week: Number(r.latest_week ?? 0),
    scheduled_through: Number(r.scheduled_through ?? 18),
    updated_at: run[0]?.finished_at ? new Date(run[0].finished_at).toISOString() : null,
  };
});

export const getSeasons = cache(async (): Promise<number[]> => {
  const rows = await sql()`select distinct season from player_week_usage order by season desc`;
  return rows.map((r) => Number(r.season));
});

export const getTeams = cache(async (): Promise<Team[]> => {
  const rows = await sql()`select * from teams where abbr in (select distinct team from player_week_usage) order by abbr`;
  return rows as Team[];
});

export const getTeam = cache(async (abbr: string): Promise<Team | null> => {
  const rows = await sql()`select * from teams where abbr = ${abbr}`;
  return (rows[0] as Team) ?? null;
});

const USAGE_SELECT = `u.*, p.name, p.headshot_url`;

export const getTeamWeekUsage = cache(async (season: number, week: number, team: string): Promise<UsageRow[]> => {
  const rows = await sql().query(
    `select ${USAGE_SELECT} from player_week_usage u join players p using (gsis_id)
     where u.season = $1 and u.week = $2 and u.team = $3 and (u.position = any($4) or u.targets > 0 or u.carries > 0)
     order by u.targets desc, u.carries desc`,
    [season, week, team, SKILL],
  );
  return rows as UsageRow[];
});

export const getTeamScopeUsage = cache(async (season: number, scope: "season" | "last4", team: string): Promise<UsageRow[]> => {
  const rows = await sql().query(
    `select ${USAGE_SELECT} from player_season_usage u join players p using (gsis_id)
     where u.season = $1 and u.scope = $2 and u.team = $3 and (u.position = any($4) or u.targets > 0 or u.carries > 0)
     order by u.targets desc, u.carries desc`,
    [season, scope, team, SKILL],
  );
  return rows as UsageRow[];
});

/** Every week row for a team's skill players in a season (grid + trend charts). */
export const getTeamAllWeeks = cache(async (season: number, team: string): Promise<UsageRow[]> => {
  const rows = await sql().query(
    `select ${USAGE_SELECT} from player_week_usage u join players p using (gsis_id)
     where u.season = $1 and u.team = $2 and (u.position = any($3) or u.targets > 0 or u.carries > 0)
     order by u.week, u.targets desc`,
    [season, team, SKILL],
  );
  return rows as UsageRow[];
});

export const getTeamContext = cache(async (season: number, team: string): Promise<TeamContext[]> => {
  const rows = await sql()`select * from team_week_context where season = ${season} and team = ${team} order by week`;
  return rows as TeamContext[];
});

export const getLeagueWeek = cache(async (season: number, week: number): Promise<UsageRow[]> => {
  const rows = await sql().query(
    `with prev as (
       select gsis_id,
              avg(snap_pct) snap_pct_prev4, avg(route_pct) route_pct_prev4,
              avg(target_share) target_share_prev4, avg(first_read_share) first_read_share_prev4,
              avg(air_yards_share) air_yards_share_prev4, avg(wopr) wopr_prev4, avg(adot) adot_prev4,
              avg(targets) targets_prev4, avg(carries) carries_prev4, avg(carry_share) carry_share_prev4,
              avg(rb_target_share) rb_target_share_prev4, avg(rz_targets) rz_targets_prev4,
              avg(inside5_carries) inside5_carries_prev4, avg(rz_carries) rz_carries_prev4,
              avg(ez_targets) ez_targets_prev4, avg(tprr_proxy) tprr_proxy_prev4,
              avg(passing_down_snaps) passing_down_snaps_prev4, avg(snaps) snaps_prev4,
              avg(receptions) receptions_prev4, avg(rec_yards) rec_yards_prev4, avg(rush_yards) rush_yards_prev4,
              avg(fantasy_points_ppr) fantasy_points_ppr_prev4
       from player_week_usage
       where season = $1 and week < $2 and week >= $2 - 4
       group by gsis_id
     )
     select ${USAGE_SELECT}, prev.*
     from player_week_usage u
     join players p using (gsis_id)
     left join prev using (gsis_id)
     where u.season = $1 and u.week = $2 and (u.position = any($3) or u.targets > 0 or u.carries > 0)
     order by u.target_share desc nulls last`,
    [season, week, SKILL],
  );
  return rows as UsageRow[];
});

export const getLeagueScope = cache(async (season: number, scope: "season" | "last4"): Promise<UsageRow[]> => {
  const rows = await sql().query(
    `select ${USAGE_SELECT} from player_season_usage u join players p using (gsis_id)
     where u.season = $1 and u.scope = $2 and (u.position = any($3) or u.targets > 0 or u.carries > 0)
     order by u.target_share desc nulls last`,
    [season, scope, SKILL],
  );
  return rows as UsageRow[];
});

/** Season table with a custom week range: aggregates on the fly. */
export const getLeagueRange = cache(async (season: number, from: number, to: number): Promise<UsageRow[]> => {
  const rows = await sql().query(
    `with w as (
       select * from player_week_usage where season = $1 and week between $2 and $3
     ), agg as (
       select gsis_id, max(team) team, max(position) position,
         count(*) filter (where coalesce(snaps,0) > 0 or targets > 0 or carries > 0) games,
         sum(snaps) snaps, sum(team_snaps) filter (where snaps is not null) team_snaps,
         sum(targets) targets, sum(team_targets) team_targets, sum(receptions) receptions, sum(rec_yards) rec_yards, sum(rec_tds) rec_tds,
         sum(air_yards) air_yards, sum(team_air_yards) team_air_yards,
         sum(first_read_targets) first_read_targets, sum(team_first_read_targets) filter (where not ftn_pending) team_first_read_targets,
         sum(rz_targets) rz_targets, sum(ez_targets) ez_targets, sum(routes_proxy) routes_proxy, sum(team_dropbacks) filter (where routes_proxy is not null) team_dropbacks,
         sum(carries) carries, sum(rush_yards) rush_yards, sum(rush_tds) rush_tds, sum(team_rb_carries) team_rb_carries, sum(team_rb_targets) team_rb_targets,
         sum(rz_carries) rz_carries, sum(inside5_carries) inside5_carries, sum(passing_down_snaps) passing_down_snaps, sum(fantasy_points_ppr) fantasy_points_ppr
       from w group by gsis_id
     )
     select a.*, p.name, p.headshot_url, $1::int as season,
       case when team_snaps > 0 then snaps::numeric / team_snaps end snap_pct,
       case when team_targets > 0 then targets::numeric / team_targets end target_share,
       case when games > 0 then targets::numeric / games end targets_pg,
       case when team_air_yards > 0 then air_yards::numeric / team_air_yards end air_yards_share,
       case when targets > 0 then air_yards::numeric / targets end adot,
       case when team_first_read_targets > 0 then first_read_targets::numeric / team_first_read_targets end first_read_share,
       case when team_dropbacks > 0 then routes_proxy::numeric / team_dropbacks end route_pct,
       case when routes_proxy > 0 then targets::numeric / routes_proxy end tprr_proxy,
       case when games > 0 then carries::numeric / games end carries_pg,
       case when a.position in ('RB','FB') and team_rb_carries > 0 then carries::numeric / team_rb_carries end carry_share,
       case when a.position in ('RB','FB') and team_rb_targets > 0 then targets::numeric / team_rb_targets end rb_target_share,
       1.5 * coalesce(case when team_targets > 0 then targets::numeric / team_targets end, 0) + 0.7 * coalesce(case when team_air_yards > 0 then air_yards::numeric / team_air_yards end, 0) wopr
     from agg a join players p using (gsis_id)
     where games > 0 and (a.position = any($4) or targets > 0 or carries > 0)
     order by target_share desc nulls last`,
    [season, from, to, SKILL],
  );
  return rows as UsageRow[];
});

export const getPlayerWeeks = cache(async (gsisId: string, season: number): Promise<UsageRow[]> => {
  const rows = await sql().query(
    `select ${USAGE_SELECT} from player_week_usage u join players p using (gsis_id) where u.gsis_id = $1 and u.season = $2 order by u.week`,
    [gsisId, season],
  );
  return rows as UsageRow[];
});

export const getPlayer = cache(async (gsisId: string) => {
  const rows = await sql()`select * from players where gsis_id = ${gsisId}`;
  return rows[0] ?? null;
});

const PROJ_SELECT = `j.*, p.name, p.headshot_url, coalesce(i.sleeper_status, i.report_status) injury_status`;

export const getProjections = cache(async (season: number, week: number, team?: string): Promise<ProjectionRow[]> => {
  const rows = await sql().query(
    `select ${PROJ_SELECT} from projections j
     join players p using (gsis_id)
     left join injuries i on i.season = j.season and i.week = j.week and i.gsis_id = j.gsis_id
     where j.season = $1 and j.week = $2 and j.is_latest and ($3::text is null or j.team = $3)
     order by j.proj_targets desc nulls last`,
    [season, week, team ?? null],
  );
  return rows as ProjectionRow[];
});

export const getProjectionAccuracy = cache(async (season: number) => {
  const rows = await sql()`select week, n_players, mae_targets, mae_carries from projection_accuracy where season = ${season} order by week`;
  return rows as { week: number; n_players: number; mae_targets: number; mae_carries: number }[];
});

export const getTeamGames = cache(async (season: number, team: string) => {
  const rows = await sql()`select week, game_id, home_team, away_team, home_score, away_score, completed, gameday
    from games where season = ${season} and game_type = 'REG' and (home_team = ${team} or away_team = ${team}) order by week`;
  return rows as { week: number; game_id: string; home_team: string; away_team: string; home_score: number | null; away_score: number | null; completed: boolean; gameday: string }[];
});

/** Home page: top target-share player per team for the latest week. */
export const getWeekLeadersByTeam = cache(async (season: number, week: number) => {
  const rows = await sql()`
    select distinct on (u.team) u.team, p.name, p.headshot_url, u.position, u.target_share, u.targets, u.opponent
    from player_week_usage u join players p using (gsis_id)
    where u.season = ${season} and u.week = ${week}
    order by u.team, u.target_share desc nulls last`;
  return rows as { team: string; name: string; headshot_url: string | null; position: string; target_share: number; targets: number; opponent: string | null }[];
});

/** Defense matchup: targets allowed per game by position group vs league average. */
export const getMatchupHeatmap = cache(async (season: number, throughWeek: number) => {
  const rows = await sql()`
    with t as (
      select opponent as defense, case when position in ('RB','FB') then 'RB' else position end pos,
             sum(targets) tgt, count(distinct week) games
      from player_week_usage where season = ${season} and week <= ${throughWeek} and position in ('WR','TE','RB','FB') and opponent is not null
      group by 1, 2
    ), lg as (select pos, sum(tgt)::numeric / sum(games) lg_pg from t group by pos)
    select t.defense, t.pos, t.tgt::numeric / t.games tgt_pg, lg.lg_pg, (t.tgt::numeric / t.games) / lg.lg_pg ratio
    from t join lg using (pos) order by t.defense, t.pos`;
  return rows as { defense: string; pos: string; tgt_pg: number; lg_pg: number; ratio: number }[];
});
