"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { seriesColor } from "@/lib/palette";
import { pct0 } from "@/lib/format";
import type { UsageRow } from "@/lib/types";

const TOOLTIP_STYLE = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

/**
 * Snap % (solid) vs route % proxy (dashed) for one WR/TE at a time. A widening
 * gap flags a blocking TE or rotational role. Route % needs participation data.
 */
export function SnapRouteLines({ rows, order }: { rows: UsageRow[]; order: Record<string, number> }) {
  const candidates = useMemo(
    () => Object.entries(order).sort((a, b) => a[1] - b[1])
      .map(([id, i]) => ({ id, i, row: rows.find((r) => r.gsis_id === id) }))
      .filter((p) => p.row && ["WR", "TE"].includes(p.row.position ?? "")),
    [order, rows],
  );
  const [sel, setSel] = useState(candidates[0]?.id);
  const player = candidates.find((c) => c.id === sel) ?? candidates[0];
  const data = useMemo(() => rows.filter((r) => r.gsis_id === player?.id).sort((a, b) => a.week! - b.week!), [rows, player]);
  const hasRoutes = data.some((d) => d.route_pct !== null);

  if (!player) return <p className="py-8 text-center text-sm text-muted">No receivers.</p>;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        {candidates.slice(0, 8).map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 ${c.id === player.id ? "bg-accent text-white" : "bg-surface-2 text-secondary hover:text-primary"}`}>
            <span className="h-2 w-2 rounded-sm" style={{ background: seriesColor(c.i) }} />
            {c.row!.name.split(" ").slice(-1)[0]}
          </button>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="week" tickFormatter={(w) => `W${w}`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(w) => `Week ${w}`} formatter={(v, n) => [pct0(v as number), n === "snap_pct" ? "Snap %" : "Route % (proxy)"]} />
            <Legend formatter={(k) => (k === "snap_pct" ? "Snap %" : "Route % (proxy)")} wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="snap_pct" type="monotone" stroke={seriesColor(player.i)} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            <Line dataKey="route_pct" type="monotone" stroke={seriesColor(player.i)} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!hasRoutes && <p className="mt-1 text-xs text-muted">Route % proxy unavailable for this season (nflverse participation data ends after 2025). Snap % only.</p>}
    </div>
  );
}
