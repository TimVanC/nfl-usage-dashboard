export interface Team {
  abbr: string;
  name: string;
  nick: string;
  conference: string | null;
  division: string | null;
  color: string | null;
  color2: string | null;
  logo_url: string | null;
}

export interface UsageRow {
  season: number;
  week?: number;
  scope?: string;
  gsis_id: string;
  name: string;
  headshot_url: string | null;
  team: string;
  opponent?: string | null;
  position: string | null;
  games?: number;
  snaps: number | null;
  team_snaps: number | null;
  snap_pct: number | null;
  targets: number;
  team_targets: number;
  target_share: number | null;
  targets_pg?: number | null;
  receptions: number;
  rec_yards: number;
  rec_tds: number;
  air_yards: number;
  team_air_yards: number;
  air_yards_share: number | null;
  wopr: number | null;
  adot: number | null;
  first_read_targets: number | null;
  team_first_read_targets: number | null;
  first_read_share: number | null;
  ftn_pending?: boolean;
  rz_targets: number;
  ez_targets: number;
  routes_proxy: number | null;
  team_dropbacks: number | null;
  route_pct: number | null;
  tprr_proxy: number | null;
  pass_snaps?: number | null;
  run_snaps?: number | null;
  carries: number;
  carries_pg?: number | null;
  rush_yards: number;
  rush_tds: number;
  team_carries?: number;
  team_rb_carries: number;
  carry_share: number | null;
  team_rb_targets: number;
  rb_target_share: number | null;
  rz_carries: number;
  inside5_carries: number;
  passing_down_snaps: number | null;
  fantasy_points_ppr: number | null;
  // delta columns (Week page "change vs prior 4 weeks")
  [key: `${string}_prev4`]: number | null | undefined;
}

export interface TeamContext {
  season: number;
  week: number;
  team: string;
  opponent: string | null;
  game_id: string | null;
  is_home: boolean | null;
  points_for: number | null;
  points_against: number | null;
  plays: number | null;
  pass_attempts: number | null;
  dropbacks: number | null;
  rush_attempts: number | null;
  pass_rate: number | null;
  neutral_pass_rate: number | null;
  proe: number | null;
  pace: number | null;
  spread_line: number | null;
  total_line: number | null;
  implied_total: number | null;
}

export interface ProjectionRow {
  season: number;
  week: number;
  gsis_id: string;
  name: string;
  headshot_url: string | null;
  team: string;
  opponent: string | null;
  position: string | null;
  proj_targets: number | null;
  proj_carries: number | null;
  proj_pass_attempts: number | null;
  proj_rush_attempts: number | null;
  weighted_target_share: number | null;
  weighted_carry_share: number | null;
  injury_adj: number | null;
  matchup_adj: number | null;
  proj_targets_low: number | null;
  proj_targets_high: number | null;
  proj_carries_low: number | null;
  proj_carries_high: number | null;
  run_at: string;
  injury_status: string | null;
}

export interface SeasonStatus {
  season: number;
  latest_week: number;
  scheduled_through: number;
  updated_at: string | null;
}
