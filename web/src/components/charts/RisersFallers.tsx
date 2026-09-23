"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
import { fmtDelta, pct0 } from "@/lib/format";
import type { UsageRow } from "@/lib/types";

const TOOLTIP_STYLE = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const OPTIONS: { key: "target_share" | "carry_share" | "route_pct" | "snap_pct"; label: string; positions: string[] }[] = [
  { key: "target_share", label: "Target share", positions: ["WR", "TE", "RB", "FB"] },
  { key: "carry_share", label: "Carry share", positions: ["RB", "FB"] },
  { key: "route_pct", label: "Route % (proxy)", positions: ["WR", "TE", "RB", "FB"] },
  { key: "snap_pct", label: "Snap %", positions: ["WR", "TE", "RB", "FB"] },
];

/** Diverging bars: change in a share metric vs the player's prior-4-week average. */
export function RisersFallers({ rows, n = 8 }: { rows: UsageRow[]; n?: number }) {
  const [metric, setMetric] = useState<(typeof OPTIONS)[number]["key"]>("target_share");
  const opt = OPTIONS.find((o) => o.key === metric)!;
  const data = useMemo(() => {
    const d = rows
      .filter((r) => opt.positions.includes(r.position ?? "") && (r.snap_pct ?? 0) >= 0.3)
      .map((r) => {
        const cur = r[metric] as number | null;
        const prev = r[`${metric}_prev4`] as number | null | undefined;
        return cur === null || prev === null || prev === undefined ? null : { name: r.name, team: r.team, cur, prev, delta: cur - prev };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.delta - a.delta);
    return [...d.slice(0, n), ...d.slice(-n)].filter((x, i, arr) => arr.indexOf(x) === i);
  }, [rows, metric, opt, n]);
  const hasData = data.length > 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        {OPTIONS.map((o) => (
          <button key={o.key} onClick={() => setMetric(o.key)} className={`rounded-md px-2.5 py-1 ${o.key === metric ? "bg-accent text-white" : "bg-surface-2 text-secondary"}`}>{o.label}</button>
        ))}
      </div>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted">Needs at least one prior week{metric === "route_pct" ? " and participation data" : ""}.</p>
      ) : (
        <div style={{ height: data.length * 26 + 40 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }} barCategoryGap={4}>
              <XAxis type="number" tickFormatter={(v) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <ReferenceLine x={0} stroke="var(--text-muted)" />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--surface-2)" }} formatter={(v, _n, p) => {
                const d = (p as { payload: { cur: number; prev: number; team: string } }).payload;
                return [`${pct0(d.prev)} → ${pct0(d.cur)} (${fmtDelta(v as number, "pct")} pts)`, d.team];
              }} />
              <Bar dataKey="delta" isAnimationActive={false} radius={[0, 4, 4, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.delta >= 0 ? "var(--div-pos)" : "var(--div-neg)"} />)}
                <LabelList dataKey="delta" position="right" formatter={(v: unknown) => fmtDelta(Number(v), "pct")} style={{ fill: "var(--text-secondary)", fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-xs text-muted">Percentage-point change vs the player's prior 4-week average. Min 30% snaps this week.</p>
    </div>
  );
}
