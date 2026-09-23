"use client";

import { useMemo, useState } from "react";
import { PlayerName } from "../PlayerDrawer";
import { Avatar } from "../Avatar";
import { METRIC_BY_KEY } from "@/lib/metrics";
import { fmt } from "@/lib/format";
import { seqColor } from "@/lib/palette";
import type { UsageRow } from "@/lib/types";

const GRID_METRICS = ["target_share", "first_read_share", "air_yards_share", "snap_pct", "route_pct", "targets", "rz_targets", "carries", "carry_share", "inside5_carries", "fantasy_points_ppr"];

/**
 * Rows = players, columns = weeks, cell = selected metric with a sequential
 * heatmap. Final columns show season and last-4 averages.
 */
export function WeekGrid({ rows, season, last4, seasonNum, order }: { rows: UsageRow[]; season: UsageRow[]; last4: UsageRow[]; seasonNum: number; order: Record<string, number> }) {
  const [metric, setMetric] = useState("target_share");
  const def = METRIC_BY_KEY[metric];
  const weeks = useMemo(() => Array.from(new Set(rows.map((r) => r.week!))).sort((a, b) => a - b), [rows]);
  const players = useMemo(() => {
    const ids = Array.from(new Set(rows.map((r) => r.gsis_id)));
    return ids
      .map((id) => {
        const s = season.find((r) => r.gsis_id === id);
        const first = rows.find((r) => r.gsis_id === id)!;
        return { id, name: first.name, headshot: first.headshot_url, position: first.position, rank: order[id] ?? 99, seasonVal: (s?.[metric as keyof UsageRow] as number | null) ?? null, last4Val: (last4.find((r) => r.gsis_id === id)?.[metric as keyof UsageRow] as number | null) ?? null, snaps: s?.snaps ?? 0 };
      })
      .filter((p) => (def.positions ? def.positions.includes(p.position ?? "") : true))
      .filter((p) => p.seasonVal !== null && p.seasonVal !== 0)
      .sort((a, b) => (b.seasonVal ?? 0) - (a.seasonVal ?? 0))
      .slice(0, 14);
  }, [rows, season, last4, metric, def, order]);

  const max = useMemo(() => {
    const vals = rows.map((r) => r[metric as keyof UsageRow] as number | null).filter((v): v is number => v !== null);
    return Math.max(...vals, def.format === "pct" ? 0.4 : 1);
  }, [rows, metric, def]);

  const cell = (v: number | null | undefined, pending?: boolean) => {
    if (pending) return <td className="border border-background bg-surface-2 text-center text-[10px] text-muted">pend.</td>;
    if (v === null || v === undefined) return <td className="border border-background bg-surface-2/40" />;
    const t = Math.min(1, v / max);
    return (
      <td className="tabular border border-background text-center text-xs" style={{ background: seqColor(t), color: t > 0.55 ? "#fff" : "var(--text-primary)" }}>
        {fmt(v, def.format)}
      </td>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {GRID_METRICS.map((m) => (
          <button key={m} onClick={() => setMetric(m)} className={`rounded-md px-2.5 py-1 ${m === metric ? "bg-accent text-white" : "bg-surface-2 text-secondary hover:text-primary"}`} title={METRIC_BY_KEY[m].label}>
            {METRIC_BY_KEY[m].short}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="sticky left-0 bg-surface-1 py-1 pr-2 text-left font-medium">{def.label}{def.proxy ? " *" : ""}</th>
              {weeks.map((w) => <th key={w} className="w-12 font-medium">W{w}</th>)}
              <th className="w-14 border-l border-border font-medium">Season</th>
              <th className="w-14 font-medium">Last 4</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="h-8">
                <td className="sticky left-0 z-10 bg-surface-1 pr-2">
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar name={p.name} src={p.headshot} size={22} />
                    <PlayerName gsisId={p.id} season={seasonNum} name={p.name} className="text-sm" />
                    <span className="text-[10px] text-muted">{p.position}</span>
                  </div>
                </td>
                {weeks.map((w) => {
                  const r = rows.find((x) => x.gsis_id === p.id && x.week === w);
                  return <WeekCell key={w} r={r} metric={metric} cell={cell} />;
                })}
                {cell(p.seasonVal)}
                {cell(p.last4Val)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {def.proxy && <p className="mt-2 text-xs text-muted">* Routes proxy: team dropbacks with the player on the field. Overstates routes for blocking tight ends. Unavailable after 2025.</p>}
    </div>
  );
}

function WeekCell({ r, metric, cell }: { r: UsageRow | undefined; metric: string; cell: (v: number | null | undefined, pending?: boolean) => React.ReactNode }) {
  if (!r) return <td className="border border-background bg-surface-2/40 text-center text-[10px] text-muted">—</td>;
  const pending = metric === "first_read_share" && r.ftn_pending;
  return <>{cell(r[metric as keyof UsageRow] as number | null, pending)}</>;
}
