import type { TeamContext } from "@/lib/types";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[110px] flex-1 rounded-lg bg-surface-2 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-lg font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`);
const signed = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(d)}`);

/**
 * Team context: neutral pass rate, pace, PROE, implied team total.
 * `ctx` is a single week row, or an average across rows for Season / Last 4.
 */
export function ContextStrip({ ctx, label }: { ctx: TeamContext[]; label: string }) {
  const played = ctx.filter((c) => c.plays !== null);
  const avg = (k: keyof TeamContext) => {
    const vals = played.map((c) => c[k] as number | null).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const implied = ctx.map((c) => c.implied_total).filter((v): v is number => v !== null);
  const impliedAvg = implied.length ? implied.reduce((a, b) => a + b, 0) / implied.length : null;
  const single = ctx.length === 1 ? ctx[0] : null;

  return (
    <div className="flex flex-wrap gap-2">
      <Stat label="Neutral pass rate" value={pct(avg("neutral_pass_rate"))} sub="WP 20–80%" />
      <Stat label="Pace" value={avg("pace") ? `${avg("pace")!.toFixed(1)}s` : "–"} sub="sec / play, neutral" />
      <Stat label="PROE" value={pct(avg("proe"))} sub="pass rate over expected" />
      <Stat label="Pass att" value={avg("pass_attempts") ? avg("pass_attempts")!.toFixed(single ? 0 : 1) : "–"} sub={single ? "this game" : "per game"} />
      <Stat label="Implied total" value={impliedAvg !== null ? impliedAvg.toFixed(1) : "–"} sub={single ? `spread ${signed(single.spread_line)} · O/U ${single.total_line ?? "–"}` : label} />
    </div>
  );
}
