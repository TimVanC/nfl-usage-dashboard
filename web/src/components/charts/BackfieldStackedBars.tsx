"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList } from "recharts";
import { seriesColor, OTHER } from "@/lib/palette";
import { pct0 } from "@/lib/format";
import type { UsageRow } from "@/lib/types";

const TOOLTIP_STYLE = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

/** Carry share stacked to 100% per week; inside-5 carries shown as a label on each segment. */
export function BackfieldStackedBars({ rows, order }: { rows: UsageRow[]; order: Record<string, number> }) {
  const rbs = useMemo(() => {
    const ids = Array.from(new Set(rows.filter((r) => ["RB", "FB"].includes(r.position ?? "") && r.carries > 0).map((r) => r.gsis_id)));
    return ids
      .map((id) => ({ id, i: order[id] ?? 99, name: rows.find((r) => r.gsis_id === id)!.name, total: rows.filter((r) => r.gsis_id === id).reduce((s, r) => s + r.carries, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [rows, order]);
  const weeks = useMemo(() => Array.from(new Set(rows.map((r) => r.week!))).sort((a, b) => a - b), [rows]);
  const data = useMemo(
    () => weeks.map((w) => {
      const o: Record<string, number | string> = { week: w };
      const wk = rows.filter((r) => r.week === w);
      let acc = 0;
      for (const rb of rbs) {
        const r = wk.find((x) => x.gsis_id === rb.id);
        const share = r?.carry_share ?? 0;
        o[rb.id] = share;
        o[`${rb.id}_i5`] = r?.inside5_carries ?? 0;
        acc += share;
      }
      o.other = Math.max(0, 1 - acc);
      return o;
    }),
    [weeks, rbs, rows],
  );

  if (rbs.length === 0) return <p className="py-8 text-center text-sm text-muted">No backfield carries.</p>;

  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tickFormatter={(w) => `W${w}`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(w) => `Week ${w}`} formatter={(v, n, p) => {
            const rb = rbs.find((r) => r.id === n);
            const i5 = (p as { payload: Record<string, number> }).payload[`${n}_i5`];
            return [`${pct0(v as number)}${rb ? ` · ${i5} inside-5` : ""}`, rb?.name ?? "Other"];
          }} />
          <Legend formatter={(id) => rbs.find((r) => r.id === id)?.name ?? "Other"} wrapperStyle={{ fontSize: 11 }} />
          {rbs.map((rb) => (
            <Bar key={rb.id} dataKey={rb.id} stackId="a" fill={seriesColor(rb.i)} stroke="var(--surface-1)" strokeWidth={1} isAnimationActive={false}>
              <LabelList dataKey={`${rb.id}_i5`} position="center" formatter={(v: unknown) => (Number(v) > 0 ? `${v}` : "")} style={{ fill: "#fff", fontSize: 10, fontWeight: 600 }} />
            </Bar>
          ))}
          <Bar dataKey="other" stackId="a" fill={OTHER} stroke="var(--surface-1)" strokeWidth={1} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
