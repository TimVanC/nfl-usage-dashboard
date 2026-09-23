"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Avatar } from "./Avatar";
import { METRIC_BY_KEY } from "@/lib/metrics";
import { fmt } from "@/lib/format";
import { SERIES } from "@/lib/palette";
import type { UsageRow } from "@/lib/types";

interface DrawerState { gsisId: string; season: number }
const Ctx = createContext<{ open: (s: DrawerState) => void }>({ open: () => {} });

export function usePlayerDrawer() {
  return useContext(Ctx);
}

export function PlayerDrawerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DrawerState | null>(null);
  const open = useCallback((s: DrawerState) => setState(s), []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state && <Drawer {...state} onClose={() => setState(null)} />}
    </Ctx.Provider>
  );
}

/** Clickable player name: opens the drawer. */
export function PlayerName({ gsisId, season, name, className }: { gsisId: string; season: number; name: string; className?: string }) {
  const { open } = usePlayerDrawer();
  return (
    <button type="button" onClick={() => open({ gsisId, season })} className={`text-left hover:text-accent hover:underline ${className ?? ""}`}>
      {name}
    </button>
  );
}

const TREND_SETS: { label: string; keys: string[] }[] = [
  { label: "Shares", keys: ["target_share", "first_read_share", "air_yards_share", "snap_pct"] },
  { label: "Backfield", keys: ["carry_share", "rb_target_share", "snap_pct"] },
  { label: "Volume", keys: ["targets", "carries", "rz_targets", "inside5_carries"] },
];

function Drawer({ gsisId, season, onClose }: DrawerState & { onClose: () => void }) {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [set, setSet] = useState(0);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetch(`/api/player/${gsisId}?season=${season}`)
      .then((r) => r.json())
      .then((d) => alive && setRows(d.rows))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [gsisId, season]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const first = rows?.[0];
  const isRb = first?.position === "RB" || first?.position === "FB";
  const activeSet = TREND_SETS[set];
  const isPct = activeSet.keys.every((k) => METRIC_BY_KEY[k].format === "pct");

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface-1 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          {first ? (
            <div className="flex items-center gap-3">
              <Avatar name={first.name} src={first.headshot_url} size={48} />
              <div>
                <div className="text-lg font-semibold">{first.name}</div>
                <div className="text-sm text-secondary">{first.position} · {rows?.[rows.length - 1]?.team} · {season}</div>
              </div>
            </div>
          ) : (
            <div className="h-12 w-48 animate-pulse rounded bg-surface-2" />
          )}
          <button onClick={onClose} className="rounded-md px-2 py-1 text-secondary hover:bg-surface-2" aria-label="Close">✕</button>
        </div>

        {rows && rows.length === 0 && <p className="mt-6 text-sm text-muted">No usage rows for this season.</p>}

        {rows && rows.length > 0 && (
          <>
            <div className="mt-5 flex gap-1 text-xs">
              {TREND_SETS.map((t, i) => (
                (i !== 1 || isRb) && (
                  <button key={t.label} onClick={() => setSet(i)} className={`rounded-md px-2.5 py-1 ${i === set ? "bg-accent text-white" : "bg-surface-2 text-secondary"}`}>
                    {t.label}
                  </button>
                )
              ))}
            </div>
            <div className="mt-3 h-64">
              <ResponsiveContainer>
                <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickFormatter={(w) => `W${w}`} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} domain={isPct ? [0, 1] : [0, "auto"]} tickFormatter={(v) => (isPct ? `${Math.round(v * 100)}%` : v)} />
                  <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelFormatter={(w) => `Week ${w}`} formatter={(v, n) => [fmt(v as number, METRIC_BY_KEY[n as string].format), METRIC_BY_KEY[n as string].label]} />
                  <Legend formatter={(k) => METRIC_BY_KEY[k]?.short ?? k} wrapperStyle={{ fontSize: 11 }} />
                  {activeSet.keys.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <table className="tabular mt-5 w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">Wk</th>
                  <th className="text-left font-medium">Opp</th>
                  <th className="text-right font-medium">Snap%</th>
                  <th className="text-right font-medium">Tgt</th>
                  <th className="text-right font-medium">Tgt%</th>
                  <th className="text-right font-medium">1stRd%</th>
                  <th className="text-right font-medium">AY%</th>
                  <th className="text-right font-medium">RZ</th>
                  <th className="text-right font-medium">Car</th>
                  {isRb && <th className="text-right font-medium">Car%</th>}
                  <th className="text-right font-medium">PPR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.week} className="border-t border-border">
                    <td className="py-1">{r.week}</td>
                    <td className="text-secondary">{r.opponent ?? "–"}</td>
                    <td className="text-right">{fmt(r.snap_pct, "pct")}</td>
                    <td className="text-right">{r.targets}</td>
                    <td className="text-right">{fmt(r.target_share, "pct")}</td>
                    <td className="text-right">{r.ftn_pending ? <span className="text-muted">pend.</span> : fmt(r.first_read_share, "pct")}</td>
                    <td className="text-right">{fmt(r.air_yards_share, "pct")}</td>
                    <td className="text-right">{r.rz_targets + r.rz_carries}</td>
                    <td className="text-right">{r.carries}</td>
                    {isRb && <td className="text-right">{fmt(r.carry_share, "pct")}</td>}
                    <td className="text-right">{fmt(r.fantasy_points_ppr, "dec1")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </aside>
    </div>
  );
}
