import { Avatar } from "../Avatar";
import { PlayerName } from "../PlayerDrawer";
import { fmt } from "@/lib/format";
import type { UsageRow } from "@/lib/types";

/** RZ targets and carries per player with snap %. */
export function RedZonePanel({ rows, season }: { rows: UsageRow[]; season: number }) {
  const rz = rows
    .filter((r) => r.rz_targets + r.rz_carries > 0)
    .sort((a, b) => b.rz_targets + b.rz_carries - (a.rz_targets + a.rz_carries))
    .slice(0, 10);
  const totalT = rows.reduce((s, r) => s + r.rz_targets, 0);
  const totalC = rows.reduce((s, r) => s + r.rz_carries, 0);
  const maxOpp = Math.max(1, ...rz.map((r) => r.rz_targets + r.rz_carries));

  if (rz.length === 0) return <p className="text-sm text-muted">No red zone touches.</p>;

  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted">
        <span>{totalT} RZ targets</span>
        <span>{totalC} RZ carries</span>
      </div>
      <table className="tabular w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="pb-1 text-left font-medium">Player</th>
            <th className="pb-1 text-right font-medium">Tgt</th>
            <th className="pb-1 text-right font-medium">EZ</th>
            <th className="pb-1 text-right font-medium">Car</th>
            <th className="pb-1 text-right font-medium">In5</th>
            <th className="pb-1 text-right font-medium">Snap%</th>
            <th className="w-20 pb-1" />
          </tr>
        </thead>
        <tbody>
          {rz.map((r) => (
            <tr key={r.gsis_id} className="border-t border-border">
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <Avatar name={r.name} src={r.headshot_url} size={24} />
                  <PlayerName gsisId={r.gsis_id} season={season} name={r.name} />
                  <span className="text-[10px] text-muted">{r.position}</span>
                </div>
              </td>
              <td className="text-right">{r.rz_targets}</td>
              <td className="text-right text-secondary">{r.ez_targets}</td>
              <td className="text-right">{r.rz_carries}</td>
              <td className="text-right text-secondary">{r.inside5_carries}</td>
              <td className="text-right">{fmt(r.snap_pct, "pct")}</td>
              <td className="pl-2">
                <div className="flex h-2 gap-px overflow-hidden rounded-sm">
                  <div className="bg-[var(--series-1)]" style={{ width: `${(r.rz_targets / maxOpp) * 100}%` }} />
                  <div className="bg-[var(--series-2)]" style={{ width: `${(r.rz_carries / maxOpp) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-3 text-[10px] text-muted">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--series-1)]" />targets</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[var(--series-2)]" />carries</span>
      </div>
    </div>
  );
}
