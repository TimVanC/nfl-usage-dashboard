"use client";

import { useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import { PlayerName } from "./PlayerDrawer";
import { fmt } from "@/lib/format";
import type { ProjectionRow } from "@/lib/types";

const POS = ["", "WR", "TE", "RB", "QB"];

/** Next-week volume projections with their drivers visible on every row. */
export function ProjectionsTable({ rows, season, teams, compact }: { rows: ProjectionRow[]; season: number; teams?: string[]; compact?: boolean }) {
  const [team, setTeam] = useState("");
  const [pos, setPos] = useState("");
  const [sort, setSort] = useState<"proj_targets" | "proj_carries">("proj_targets");
  const data = useMemo(
    () => rows.filter((r) => (!team || r.team === team) && (!pos || r.position === pos)).sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1)),
    [rows, team, pos, sort],
  );
  const selectCls = "rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-primary";

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {teams && (
            <select value={team} onChange={(e) => setTeam(e.target.value)} className={selectCls} aria-label="Team">
              <option value="">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <select value={pos} onChange={(e) => setPos(e.target.value)} className={selectCls} aria-label="Position">
            {POS.map((p) => <option key={p} value={p}>{p || "All positions"}</option>)}
          </select>
          <div className="flex gap-1 text-xs">
            <button onClick={() => setSort("proj_targets")} className={`rounded-md px-2.5 py-1.5 ${sort === "proj_targets" ? "bg-accent text-white" : "bg-surface-2 text-secondary"}`}>By targets</button>
            <button onClick={() => setSort("proj_carries")} className={`rounded-md px-2.5 py-1.5 ${sort === "proj_carries" ? "bg-accent text-white" : "bg-surface-2 text-secondary"}`}>By carries</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="tabular w-full text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Player</th>
              <th className="px-2 text-left font-medium">Pos</th>
              {!compact && <th className="px-2 text-left font-medium">Team</th>}
              <th className="px-2 text-left font-medium">Opp</th>
              <th className="px-2 text-right font-medium" title="Projected targets (low–high range)">Proj Tgt</th>
              <th className="px-2 text-right font-medium" title="Projected carries">Proj Car</th>
              <th className="px-2 text-right font-medium" title="Projected team pass attempts">Team PA</th>
              <th className="px-2 text-right font-medium" title="Weighted share (EWM of last 6 games, blended with first-read share, after injury redistribution)">Share</th>
              <th className="px-2 text-right font-medium" title="Injury redistribution multiplier">Inj</th>
              <th className="px-2 text-right font-medium" title="Opponent matchup multiplier (targets allowed by position vs league avg, shrunk early)">Matchup</th>
              <th className="px-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, compact ? 12 : 300).map((r) => (
              <tr key={r.gsis_id} className="border-t border-border hover:bg-surface-2/60">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar name={r.name} src={r.headshot_url} size={24} />
                    <PlayerName gsisId={r.gsis_id} season={season} name={r.name} className="font-medium" />
                  </div>
                </td>
                <td className="px-2 text-secondary">{r.position}</td>
                {!compact && <td className="px-2"><a href={`/team/${r.team}`} className="text-secondary hover:text-accent">{r.team}</a></td>}
                <td className="px-2 text-muted">{r.opponent ?? "–"}</td>
                <td className="px-2 text-right">
                  <span className="font-semibold">{fmt(r.proj_targets, "dec1")}</span>
                  <span className="ml-1 text-[10px] text-muted">{fmt(r.proj_targets_low, "dec1")}–{fmt(r.proj_targets_high, "dec1")}</span>
                </td>
                <td className="px-2 text-right">{r.proj_carries !== null ? <><span className="font-semibold">{fmt(r.proj_carries, "dec1")}</span><span className="ml-1 text-[10px] text-muted">{fmt(r.proj_carries_low, "dec1")}–{fmt(r.proj_carries_high, "dec1")}</span></> : <span className="text-muted">–</span>}</td>
                <td className="px-2 text-right text-secondary">{fmt(r.proj_pass_attempts, "dec1")}</td>
                <td className="px-2 text-right text-secondary">{fmt(r.weighted_target_share, "pct")}</td>
                <td className={`px-2 text-right ${r.injury_adj !== null && r.injury_adj > 1.02 ? "text-good" : r.injury_adj === 0 ? "text-bad" : "text-secondary"}`}>{r.injury_adj !== null ? `×${r.injury_adj.toFixed(2)}` : "–"}</td>
                <td className={`px-2 text-right ${r.matchup_adj !== null && r.matchup_adj > 1.05 ? "text-good" : r.matchup_adj !== null && r.matchup_adj < 0.95 ? "text-bad" : "text-secondary"}`}>{r.matchup_adj !== null ? `×${r.matchup_adj.toFixed(2)}` : "–"}</td>
                <td className="px-2 text-xs">{r.injury_status ? <span className={["Out", "IR", "Doubtful", "PUP", "Sus"].includes(r.injury_status) ? "text-bad" : "text-warn"}>{r.injury_status}</span> : <span className="text-muted">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
