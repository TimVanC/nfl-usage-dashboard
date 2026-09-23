/** Metric catalog: keys match player_week_usage / player_season_usage columns. */

export type MetricFormat = "pct" | "int" | "dec1" | "dec2";
export type MetricGroup = "Receiving" | "Backfield" | "Snaps" | "Fantasy";

export interface MetricDef {
  key: string;
  label: string;
  short: string;
  group: MetricGroup;
  format: MetricFormat;
  definition: string;
  source: string;
  proxy?: boolean;
  /** Positions this metric applies to (undefined = all) */
  positions?: string[];
}

export const METRICS: MetricDef[] = [
  { key: "snap_pct", label: "Snap %", short: "Snap%", group: "Snaps", format: "pct", definition: "Offensive snaps / team offensive snaps.", source: "nflverse snap counts" },
  { key: "snaps", label: "Snaps", short: "Snaps", group: "Snaps", format: "int", definition: "Offensive snaps played.", source: "nflverse snap counts" },
  { key: "route_pct", label: "Route % (proxy)", short: "Rt%*", group: "Snaps", format: "pct", proxy: true, definition: "Team dropbacks with the player on the field / team dropbacks. A proxy: overstates routes for blocking tight ends. Requires nflverse participation data (2016-2025 only).", source: "nflverse participation" },
  { key: "targets", label: "Targets", short: "Tgt", group: "Receiving", format: "int", definition: "Passes thrown to the player (official stat definition; no 2-pt tries).", source: "nflverse PBP" },
  { key: "target_share", label: "Target share", short: "Tgt%", group: "Receiving", format: "pct", definition: "Player targets / team targets.", source: "nflverse PBP" },
  { key: "first_read_share", label: "First-read share", short: "1stRd%", group: "Receiving", format: "pct", definition: "Player first-read + designed targets / team first-read + designed targets. FTN read_thrown in {1, DES}.", source: "FTN charting via nflverse" },
  { key: "air_yards_share", label: "Air yards share", short: "AY%", group: "Receiving", format: "pct", definition: "Player air yards / team air yards.", source: "nflverse PBP" },
  { key: "wopr", label: "WOPR", short: "WOPR", group: "Receiving", format: "dec2", definition: "1.5 × target share + 0.7 × air yards share.", source: "Derived" },
  { key: "adot", label: "aDOT", short: "aDOT", group: "Receiving", format: "dec1", definition: "Air yards / targets.", source: "nflverse PBP" },
  { key: "tprr_proxy", label: "Targets per route (proxy)", short: "TPRR*", group: "Receiving", format: "pct", proxy: true, definition: "Targets / routes proxy.", source: "Derived" },
  { key: "rz_targets", label: "Red zone targets", short: "RZ Tgt", group: "Receiving", format: "int", definition: "Targets inside the opponent 20.", source: "nflverse PBP" },
  { key: "ez_targets", label: "End zone targets", short: "EZ Tgt", group: "Receiving", format: "int", definition: "Targets with air yards reaching the end zone.", source: "nflverse PBP" },
  { key: "receptions", label: "Receptions", short: "Rec", group: "Receiving", format: "int", definition: "Catches.", source: "nflverse PBP" },
  { key: "rec_yards", label: "Receiving yards", short: "ReY", group: "Receiving", format: "int", definition: "Receiving yards.", source: "nflverse PBP" },
  { key: "carries", label: "Carries", short: "Car", group: "Backfield", format: "int", definition: "Rush attempts (kneels excluded).", source: "nflverse PBP" },
  { key: "carry_share", label: "Carry share", short: "Car%", group: "Backfield", format: "pct", positions: ["RB", "FB"], definition: "Player carries / team RB carries.", source: "nflverse PBP" },
  { key: "rb_target_share", label: "RB target share", short: "RB Tgt%", group: "Backfield", format: "pct", positions: ["RB", "FB"], definition: "Player targets / team RB targets.", source: "nflverse PBP" },
  { key: "inside5_carries", label: "Inside-5 carries", short: "In5", group: "Backfield", format: "int", definition: "Carries inside the opponent 5.", source: "nflverse PBP" },
  { key: "rz_carries", label: "Red zone carries", short: "RZ Car", group: "Backfield", format: "int", definition: "Carries inside the opponent 20.", source: "nflverse PBP" },
  { key: "passing_down_snaps", label: "Passing-down snaps", short: "PD Snp", group: "Backfield", format: "int", positions: ["RB", "FB"], definition: "Snaps on 3rd down and inside two minutes of a half (participation data, 2016-2025 only).", source: "nflverse participation" },
  { key: "rush_yards", label: "Rushing yards", short: "RuY", group: "Backfield", format: "int", definition: "Rushing yards.", source: "nflverse PBP" },
  { key: "fantasy_points_ppr", label: "PPR points", short: "PPR", group: "Fantasy", format: "dec1", definition: "Standard PPR scoring from receiving and rushing only (no passing).", source: "Derived" },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export const DEFAULT_COLUMNS = ["snap_pct", "route_pct", "targets", "target_share", "first_read_share", "air_yards_share", "wopr", "rz_targets", "carries", "carry_share", "inside5_carries"];

export interface Preset {
  key: string;
  label: string;
  columns: string[];
  sort: string;
  positions?: string[];
  delta?: boolean;
  minSnapPct?: number;
}

export const PRESETS: Preset[] = [
  { key: "targets", label: "Target share leaders", columns: ["snap_pct", "route_pct", "targets", "target_share", "air_yards_share", "wopr", "adot", "rz_targets"], sort: "target_share", positions: ["WR", "TE", "RB"] },
  { key: "firstread", label: "First-read leaders", columns: ["snap_pct", "targets", "target_share", "first_read_share", "air_yards_share", "ez_targets"], sort: "first_read_share", positions: ["WR", "TE", "RB"] },
  { key: "backfield", label: "Backfield workhorses", columns: ["snap_pct", "carries", "carry_share", "rb_target_share", "inside5_carries", "rz_carries", "passing_down_snaps", "targets"], sort: "carry_share", positions: ["RB", "FB"] },
  { key: "redzone", label: "Red zone roles", columns: ["snap_pct", "rz_targets", "ez_targets", "rz_carries", "inside5_carries", "target_share", "carry_share"], sort: "rz_targets" },
  { key: "risers", label: "Biggest risers", columns: ["snap_pct", "target_share", "first_read_share", "air_yards_share", "carry_share"], sort: "target_share", delta: true, minSnapPct: 0.3 },
];
