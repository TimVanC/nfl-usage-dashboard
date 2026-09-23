-- NFL Usage Dashboard schema (Postgres / Neon)
-- Applied idempotently by etl/run_etl.py --init-db (or psql -f db/schema.sql)

create table if not exists teams (
  abbr        text primary key,
  name        text not null,
  nick        text not null,
  conference  text,
  division    text,
  color       text,
  color2      text,
  logo_url    text
);

create table if not exists players (
  gsis_id      text primary key,
  name         text not null,
  short_name   text,
  position     text,
  team         text,
  headshot_url text,
  sleeper_id   text,
  updated_at   timestamptz not null default now()
);
create index if not exists players_team_idx on players(team);

create table if not exists games (
  game_id     text primary key,
  season      int  not null,
  week        int  not null,
  game_type   text not null,
  gameday     date,
  home_team   text not null,
  away_team   text not null,
  home_score  int,
  away_score  int,
  spread_line numeric,   -- positive = home favored (nflverse convention)
  total_line  numeric,
  result      int,       -- home_score - away_score
  completed   boolean not null default false
);
create index if not exists games_season_week_idx on games(season, week);

-- Player x week usage (regular season only)
create table if not exists player_week_usage (
  season               int  not null,
  week                 int  not null,
  gsis_id              text not null,
  game_id              text,
  team                 text not null,
  opponent             text,
  position             text,
  -- snaps
  snaps                int,
  team_snaps           int,
  snap_pct             numeric,
  -- receiving
  targets              int  not null default 0,
  team_targets         int  not null default 0,
  target_share         numeric,
  receptions           int  not null default 0,
  rec_yards            int  not null default 0,
  rec_tds              int  not null default 0,
  air_yards            int  not null default 0,
  team_air_yards       int  not null default 0,
  air_yards_share      numeric,
  wopr                 numeric,
  adot                 numeric,
  first_read_targets   int,
  team_first_read_targets int,
  first_read_share     numeric,
  ftn_pending          boolean not null default false,
  rz_targets           int  not null default 0,
  ez_targets           int  not null default 0,
  routes_proxy         int,
  team_dropbacks       int,
  route_pct            numeric,
  tprr_proxy           numeric,
  pass_snaps           int,
  run_snaps            int,
  -- backfield
  carries              int  not null default 0,
  rush_yards           int  not null default 0,
  rush_tds             int  not null default 0,
  team_carries         int  not null default 0,
  team_rb_carries      int  not null default 0,
  carry_share          numeric,
  team_rb_targets      int  not null default 0,
  rb_target_share      numeric,
  rz_carries           int  not null default 0,
  inside5_carries      int  not null default 0,
  passing_down_snaps   int,
  -- fantasy (for reference only)
  fantasy_points_ppr   numeric,
  updated_at           timestamptz not null default now(),
  primary key (season, week, gsis_id)
);
create index if not exists pwu_team_week_idx on player_week_usage(season, team, week);
create index if not exists pwu_season_week_idx on player_week_usage(season, week);

create table if not exists team_week_context (
  season            int  not null,
  week              int  not null,
  team              text not null,
  opponent          text,
  game_id           text,
  is_home           boolean,
  points_for        int,
  points_against    int,
  plays             int,
  pass_attempts     int,
  dropbacks         int,
  rush_attempts     int,
  pass_rate         numeric,
  neutral_pass_rate numeric,
  proe              numeric,
  pace              numeric,          -- seconds per play, neutral situations
  spread_line       numeric,          -- from this team's perspective (negative = favored)
  total_line        numeric,
  implied_total     numeric,
  updated_at        timestamptz not null default now(),
  primary key (season, week, team)
);

-- Aggregated usage per player: scope = 'season' (all weeks to date) or 'last4'
create table if not exists player_season_usage (
  season               int  not null,
  scope                text not null,
  gsis_id              text not null,
  team                 text not null,
  position             text,
  games                int  not null,
  snaps                int,
  team_snaps           int,
  snap_pct             numeric,
  targets              int,
  team_targets         int,
  target_share         numeric,
  targets_pg           numeric,
  receptions           int,
  rec_yards            int,
  rec_tds              int,
  air_yards            int,
  team_air_yards       int,
  air_yards_share      numeric,
  wopr                 numeric,
  adot                 numeric,
  first_read_targets   int,
  team_first_read_targets int,
  first_read_share     numeric,
  rz_targets           int,
  ez_targets           int,
  routes_proxy         int,
  team_dropbacks       int,
  route_pct            numeric,
  tprr_proxy           numeric,
  carries              int,
  carries_pg           numeric,
  rush_yards           int,
  rush_tds             int,
  team_rb_carries      int,
  carry_share          numeric,
  team_rb_targets      int,
  rb_target_share      numeric,
  rz_carries           int,
  inside5_carries      int,
  passing_down_snaps   int,
  fantasy_points_ppr   numeric,
  updated_at           timestamptz not null default now(),
  primary key (season, scope, gsis_id)
);

create table if not exists injuries (
  season            int  not null,
  week              int  not null,
  gsis_id           text not null,
  team              text,
  position          text,
  report_status     text,   -- Out / Doubtful / Questionable
  practice_status   text,
  primary_injury    text,
  sleeper_status    text,   -- live status from Sleeper (IR, Out, Doubtful, Questionable, ...)
  updated_at        timestamptz not null default now(),
  primary key (season, week, gsis_id)
);

create table if not exists projections (
  season                int  not null,
  week                  int  not null,
  gsis_id               text not null,
  run_id                text not null,
  run_at                timestamptz not null default now(),
  team                  text not null,
  opponent              text,
  position              text,
  proj_targets          numeric,
  proj_carries          numeric,
  proj_pass_attempts    numeric,
  proj_rush_attempts    numeric,
  weighted_target_share numeric,
  weighted_carry_share  numeric,
  injury_adj            numeric,
  matchup_adj           numeric,
  proj_targets_low      numeric,
  proj_targets_high     numeric,
  proj_carries_low      numeric,
  proj_carries_high     numeric,
  is_latest             boolean not null default true,
  primary key (season, week, gsis_id, run_id)
);
create index if not exists projections_latest_idx on projections(season, week) where is_latest;

create table if not exists projection_accuracy (
  season        int  not null,
  week          int  not null,
  run_id        text not null,
  n_players     int,
  mae_targets   numeric,
  mae_carries   numeric,
  computed_at   timestamptz not null default now(),
  primary key (season, week, run_id)
);

create table if not exists etl_runs (
  id           bigserial primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running',
  seasons      int[],
  latest_week  int,
  notes        text
);

-- Convenience view: latest completed week per season
create or replace view season_status as
select season,
       max(week) filter (where completed) as latest_week,
       max(week) as scheduled_through
from games
where game_type = 'REG'
group by season;
