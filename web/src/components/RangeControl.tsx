"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Season page week-range control: from/to sliders plus Season / Last 4 presets. */
export function RangeControl({ latest, from, to, scope, season }: { latest: number; from: number; to: number; scope: string; season?: number }) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const base = season ? `/season?season=${season}&` : "/season?";
  const go = (q: string) => router.push(`${base}${q}`);
  const apply = () => go(`from=${Math.min(f, t)}&to=${Math.max(f, t)}`);
  const btn = (active: boolean) => `rounded-md px-3 py-1.5 text-sm ${active ? "bg-accent text-white" : "border border-border bg-surface-2 text-secondary hover:text-primary"}`;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={() => go("scope=season")} className={btn(scope === "season")}>Season</button>
      <button onClick={() => go("scope=last4")} className={btn(scope === "last4")}>Last 4</button>
      <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${scope === "range" ? "border-accent" : "border-border"}`}>
        <span className="text-xs text-muted">Weeks</span>
        <input type="range" min={1} max={latest} value={f} onChange={(e) => setF(Number(e.target.value))} className="w-24 accent-[var(--accent)]" aria-label="From week" />
        <span className="tabular w-5 text-center">{f}</span>
        <span className="text-muted">–</span>
        <input type="range" min={1} max={latest} value={t} onChange={(e) => setT(Number(e.target.value))} className="w-24 accent-[var(--accent)]" aria-label="To week" />
        <span className="tabular w-5 text-center">{t}</span>
        <button onClick={apply} className="rounded bg-surface-1 px-2 py-0.5 text-xs text-secondary hover:text-primary">Apply</button>
      </div>
    </div>
  );
}
