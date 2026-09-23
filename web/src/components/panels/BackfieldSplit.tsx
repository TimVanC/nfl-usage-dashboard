import { Avatar } from "../Avatar";
import { PlayerName } from "../PlayerDrawer";
import { fmt } from "@/lib/format";
import type { UsageRow } from "@/lib/types";

/** Carry share, RB target share, inside-5 carries and passing-down snaps per RB. */
export function BackfieldSplit({ rows, season }: { rows: UsageRow[]; season: number }) {
  const rbs = rows
    .filter((r) => ["RB", "FB"].includes(r.position ?? "") && ((r.snaps ?? 0) > 0 || r.carries > 0 || r.targets > 0))
    .sort((a, b) => (b.carry_share ?? 0) - (a.carry_share ?? 0))
    .slice(0, 6);
  const hasPd = rbs.some((r) => r.passing_down_snaps !== null);

  if (rbs.length === 0) return <p className="text-sm text-muted">No backfield data.</p>;

  return (
    <table className="tabular w-full text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="pb-1 text-left font-medium">Back</th>
          <th className="pb-1 text-right font-medium">Snap%</th>
          <th className="pb-1 text-right font-medium">Car</th>
          <th className="pb-1 text-right font-medium">Car%</th>
          <th className="pb-1 text-right font-medium">Tgt</th>
          <th className="pb-1 text-right font-medium">RB Tgt%</th>
          <th className="pb-1 text-right font-medium">In5</th>
          <th className="pb-1 text-right font-medium" title="Snaps on 3rd down / inside two minutes">PD snaps</th>
        </tr>
      </thead>
      <tbody>
        {rbs.map((r) => (
          <tr key={r.gsis_id} className="border-t border-border">
            <td className="py-1.5">
              <div className="flex items-center gap-2">
                <Avatar name={r.name} src={r.headshot_url} size={24} />
                <PlayerName gsisId={r.gsis_id} season={season} name={r.name} />
              </div>
            </td>
            <td className="text-right">{fmt(r.snap_pct, "pct")}</td>
            <td className="text-right">{r.carries}</td>
            <td className="text-right">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-12 overflow-hidden rounded-sm bg-surface-2"><span className="block h-full bg-[var(--series-2)]" style={{ width: `${(r.carry_share ?? 0) * 100}%` }} /></span>
                {fmt(r.carry_share, "pct")}
              </span>
            </td>
            <td className="text-right">{r.targets}</td>
            <td className="text-right">{fmt(r.rb_target_share, "pct")}</td>
            <td className="text-right">{r.inside5_carries}</td>
            <td className="text-right">{hasPd ? (r.passing_down_snaps ?? "–") : <span className="text-muted" title="Needs participation data (2016-2025)">n/a</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
