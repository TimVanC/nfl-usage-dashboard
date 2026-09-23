"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Avatar } from "../Avatar";
import { PlayerName } from "../PlayerDrawer";
import { seriesColor, OTHER } from "@/lib/palette";
import { pct0 } from "@/lib/format";
import type { UsageRow } from "@/lib/types";

const MAX_SLICES = 8;

/**
 * Team target-share donut. Players are colored in fixed order by season
 * target share (the `order` map) so the same player keeps the same color in
 * every chart on the page. Players beyond slot 8 fold into "Other".
 */
export function TargetShareDonut({ rows, order, season, teamTargets }: { rows: UsageRow[]; order: Record<string, number>; season: number; teamTargets: number }) {
  const withTargets = rows.filter((r) => r.targets > 0).sort((a, b) => b.targets - a.targets);
  const top = withTargets.filter((r) => (order[r.gsis_id] ?? 99) < MAX_SLICES);
  const rest = withTargets.filter((r) => (order[r.gsis_id] ?? 99) >= MAX_SLICES);
  const otherTargets = rest.reduce((s, r) => s + r.targets, 0);
  const data = [
    ...top.map((r) => ({ name: r.name, value: r.targets, color: seriesColor(order[r.gsis_id]), share: r.target_share ?? 0 })),
    ...(otherTargets > 0 ? [{ name: `Other (${rest.length})`, value: otherTargets, color: OTHER, share: otherTargets / Math.max(teamTargets, 1) }] : []),
  ];

  if (data.length === 0) return <p className="text-sm text-muted">No targets recorded.</p>;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
      <div className="relative h-56">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={1.5} stroke="var(--surface-1)" strokeWidth={2} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v, n, p) => [`${v} targets · ${pct0((p as { payload: { share: number } }).payload.share)}`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-semibold tabular">{teamTargets}</div>
          <div className="text-xs text-muted">team targets</div>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 self-center sm:grid-cols-2">
        {top.map((r) => (
          <li key={r.gsis_id} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: seriesColor(order[r.gsis_id]) }} />
            <Avatar name={r.name} src={r.headshot_url} size={26} />
            <PlayerName gsisId={r.gsis_id} season={season} name={r.name} className="truncate" />
            <span className="ml-auto tabular font-medium">{pct0(r.target_share)}</span>
            <span className="tabular w-8 text-right text-xs text-muted">{r.targets}</span>
          </li>
        ))}
        {otherTargets > 0 && (
          <li className="flex items-center gap-2 text-sm text-secondary">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OTHER }} />
            <span className="w-[26px]" />
            <span>Other ({rest.length})</span>
            <span className="ml-auto tabular font-medium">{pct0(otherTargets / Math.max(teamTargets, 1))}</span>
            <span className="tabular w-8 text-right text-xs text-muted">{otherTargets}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
