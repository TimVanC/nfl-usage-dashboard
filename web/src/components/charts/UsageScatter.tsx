"use client";

import { useMemo, useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, LabelList, Legend } from "recharts";
import { SERIES } from "@/lib/palette";
import { pct0 } from "@/lib/format";
import type { UsageRow } from "@/lib/types";

const TOOLTIP_STYLE = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const GROUPS: { key: string; label: string; positions: string[]; color: string }[] = [
  { key: "WR", label: "WR", positions: ["WR"], color: SERIES[0] },
  { key: "TE", label: "TE", positions: ["TE"], color: SERIES[1] },
  { key: "RB", label: "RB", positions: ["RB", "FB"], color: SERIES[2] },
];

/**
 * Target share vs air yards share, every player league-wide. Top-right is
 * elite usage. Three position series (validated all-pairs). A second mode
 * plots first-read share vs target share (designed usage vs checkdown volume).
 */
export function UsageScatter({ rows, minTargets = 3 }: { rows: UsageRow[]; minTargets?: number }) {
  const [mode, setMode] = useState<"ay" | "fr">("ay");
  const xKey = mode === "ay" ? "target_share" : "first_read_share";
  const yKey = mode === "ay" ? "air_yards_share" : "target_share";
  const data = useMemo(
    () => rows.filter((r) => r.targets >= minTargets && r[xKey] !== null && r[yKey] !== null && ["WR", "TE", "RB", "FB"].includes(r.position ?? "")),
    [rows, minTargets, xKey, yKey],
  );
  const labelCut = useMemo(() => {
    const xs = data.map((r) => r[xKey] as number).sort((a, b) => b - a);
    return xs[Math.min(11, xs.length - 1)] ?? 1;
  }, [data, xKey]);
  const hasFr = rows.some((r) => r.first_read_share !== null);

  return (
    <div>
      <div className="mb-2 flex gap-1 text-xs">
        <button onClick={() => setMode("ay")} className={`rounded-md px-2.5 py-1 ${mode === "ay" ? "bg-accent text-white" : "bg-surface-2 text-secondary"}`}>Target share vs air yards share</button>
        <button onClick={() => setMode("fr")} disabled={!hasFr} className={`rounded-md px-2.5 py-1 disabled:opacity-40 ${mode === "fr" ? "bg-accent text-white" : "bg-surface-2 text-secondary"}`}>First-read share vs target share</button>
      </div>
      <div className="h-[420px]">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 24, left: -8, bottom: 8 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis type="number" dataKey={xKey} name={mode === "ay" ? "Target share" : "First-read share"} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: mode === "ay" ? "Target share" : "First-read share", position: "insideBottom", offset: -4, fill: "var(--text-muted)", fontSize: 11 }} />
            <YAxis type="number" dataKey={yKey} name={mode === "ay" ? "Air yards share" : "Target share"} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: mode === "ay" ? "Air yards share" : "Target share", angle: -90, position: "insideLeft", offset: 20, fill: "var(--text-muted)", fontSize: 11 }} />
            <ReferenceLine x={0.2} stroke="var(--border)" strokeDasharray="4 4" />
            <ReferenceLine y={0.2} stroke="var(--border)" strokeDasharray="4 4" />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--border)" }} content={({ payload }) => {
              const p = payload?.[0]?.payload as UsageRow | undefined;
              if (!p) return null;
              return (
                <div style={TOOLTIP_STYLE} className="p-2">
                  <div className="font-medium">{p.name} <span className="text-muted">{p.team} {p.position}</span></div>
                  <div>Tgt share {pct0(p.target_share)} · AY share {pct0(p.air_yards_share)} · 1st-read {pct0(p.first_read_share)}</div>
                  <div className="text-muted">{p.targets} targets</div>
                </div>
              );
            }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {GROUPS.map((g) => (
              <Scatter key={g.key} name={g.label} data={data.filter((r) => g.positions.includes(r.position ?? ""))} fill={g.color} stroke="var(--surface-1)" strokeWidth={1} isAnimationActive={false}>
                <LabelList dataKey="name" position="right" content={(props) => {
                  const { x, y, value, index } = props as { x?: number; y?: number; value?: string; index?: number };
                  const row = data.filter((r) => g.positions.includes(r.position ?? ""))[index ?? -1];
                  if (!row || (row[xKey] as number) < labelCut) return null;
                  return <text x={(x ?? 0) + 7} y={(y ?? 0) + 3} fontSize={10} fill="var(--text-secondary)">{String(value).split(" ").slice(-1)[0]}</text>;
                }} />
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted">Players with {minTargets}+ targets. Top-12 by x-axis are labeled.</p>
    </div>
  );
}
