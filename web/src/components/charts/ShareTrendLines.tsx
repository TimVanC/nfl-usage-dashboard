"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { seriesColor } from "@/lib/palette";
import { fmt } from "@/lib/format";
import { METRIC_BY_KEY } from "@/lib/metrics";
import type { UsageRow } from "@/lib/types";

const TOOLTIP_STYLE = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

/**
 * One line per player across weeks. `metric` defaults to target share; the
 * toggle switches to a few other share metrics. Max 8 players (fixed color order).
 */
export function ShareTrendLines({ rows, order, metrics = ["target_share", "first_read_share", "air_yards_share", "route_pct"] }: { rows: UsageRow[]; order: Record<string, number>; metrics?: string[] }) {
  const [metric, setMetric] = useState(metrics[0]);
  const players = useMemo(
    () => Object.entries(order).sort((a, b) => a[1] - b[1]).slice(0, 8).map(([id, i]) => ({ id, i, name: rows.find((r) => r.gsis_id === id)?.name ?? id })),
    [order, rows],
  );
  const weeks = useMemo(() => Array.from(new Set(rows.map((r) => r.week!))).sort((a, b) => a - b), [rows]);
  const data = useMemo(
    () => weeks.map((w) => {
      const o: Record<string, number | null> = { week: w };
      for (const p of players) {
        const r = rows.find((x) => x.week === w && x.gsis_id === p.id);
        o[p.id] = (r?.[metric as keyof UsageRow] as number | null) ?? null;
      }
      return o;
    }),
    [weeks, players, rows, metric],
  );
  const def = METRIC_BY_KEY[metric];
  const hasData = data.some((d) => players.some((p) => d[p.id] !== null));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        {metrics.map((m) => (
          <button key={m} onClick={() => setMetric(m)} className={`rounded-md px-2.5 py-1 ${m === metric ? "bg-accent text-white" : "bg-surface-2 text-secondary hover:text-primary"}`}>
            {METRIC_BY_KEY[m].short}
          </button>
        ))}
      </div>
      {!hasData ? (
        <p className="py-8 text-center text-sm text-muted">{def.proxy ? "Participation data (routes proxy) is not available for this season." : "No data."}</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="week" tickFormatter={(w) => `W${w}`} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={def.format === "pct" ? [0, "auto"] : [0, "auto"]} tickFormatter={(v) => (def.format === "pct" ? `${Math.round(v * 100)}%` : v)} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(w) => `Week ${w}`} formatter={(v, n) => [fmt(v as number, def.format), players.find((p) => p.id === n)?.name ?? n]} />
              <Legend formatter={(id) => players.find((p) => p.id === id)?.name ?? id} itemSorter={(item) => players.findIndex((p) => p.id === item.dataKey)} wrapperStyle={{ fontSize: 11 }} />
              {players.map((p) => (
                <Line key={p.id} dataKey={p.id} type="monotone" stroke={seriesColor(p.i)} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
