"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState, type ColumnDef,
} from "@tanstack/react-table";
import { Avatar } from "./Avatar";
import { PlayerName } from "./PlayerDrawer";
import { DEFAULT_COLUMNS, METRICS, METRIC_BY_KEY, PRESETS } from "@/lib/metrics";
import { fmt, fmtDelta } from "@/lib/format";
import { divColor } from "@/lib/palette";
import type { UsageRow } from "@/lib/types";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const col = createColumnHelper<UsageRow>();

interface Props {
  rows: UsageRow[];
  season: number;
  teams: string[];
  /** Week page: enables "change vs prior 4 weeks" toggle (rows carry *_prev4 fields) */
  allowDelta?: boolean;
  scopeLabel: string;
}

export function UsageTable({ rows, season, teams, allowDelta, scopeLabel }: Props) {
  const [team, setTeam] = useState("");
  const [pos, setPos] = useState("");
  const [opp, setOpp] = useState("");
  const [minSnap, setMinSnap] = useState(0);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState<string[]>(DEFAULT_COLUMNS);
  const [delta, setDelta] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "target_share", desc: true }]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key)!;
    setPreset(key);
    setVisible(p.columns);
    setPos(p.positions ? p.positions.join(",") : "");
    setSorting([{ id: p.sort, desc: true }]);
    if (p.delta && allowDelta) setDelta(true); else setDelta(false);
    if (p.minSnapPct) setMinSnap(p.minSnapPct);
  };

  const filtered = useMemo(() => {
    const posSet = pos ? new Set(pos.split(",")) : null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (!team || r.team === team) &&
      (!posSet || posSet.has(r.position ?? "")) &&
      (!opp || r.opponent === opp) &&
      (minSnap === 0 || (r.snap_pct ?? 0) >= minSnap) &&
      (!q || r.name.toLowerCase().includes(q)),
    );
  }, [rows, team, pos, opp, minSnap, search]);

  const columns = useMemo<ColumnDef<UsageRow, unknown>[]>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: any[] = [
      col.display({
        id: "player",
        header: "Player",
        cell: ({ row }) => (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Avatar name={row.original.name} src={row.original.headshot_url} size={24} />
            <PlayerName gsisId={row.original.gsis_id} season={season} name={row.original.name} className="font-medium" />
          </div>
        ),
      }),
      col.accessor("position", { header: "Pos", cell: (c) => <span className="text-secondary">{c.getValue()}</span> }),
      col.accessor("team", { header: "Team", cell: (c) => <a href={`/team/${c.getValue()}`} className="text-secondary hover:text-accent">{c.getValue()}</a> }),
    ];
    if (rows[0]?.opponent !== undefined) base.push(col.accessor("opponent", { header: "Opp", cell: (c) => <span className="text-muted">{c.getValue() ?? "–"}</span> }));
    if (rows[0]?.games !== undefined) base.push(col.accessor("games", { header: "G", cell: (c) => <span className="text-muted">{c.getValue()}</span> }));
    for (const key of visible) {
      const def = METRIC_BY_KEY[key];
      if (!def) continue;
      base.push(
        col.accessor((r) => {
          const v = r[key as keyof UsageRow] as number | null;
          if (!delta) return v;
          const prev = r[`${key}_prev4`] as number | null | undefined;
          return v === null || prev === null || prev === undefined ? null : v - prev;
        }, {
          id: key,
          header: () => <span title={def.definition}>{def.short}</span>,
          sortUndefined: "last",
          sortingFn: (a, b, id) => {
            const x = a.getValue<number | null>(id), y = b.getValue<number | null>(id);
            if (x === null && y === null) return 0;
            if (x === null) return -1;
            if (y === null) return 1;
            return x - y;
          },
          cell: (c) => {
            const v = c.getValue() as number | null;
            const r = c.row.original;
            if (key === "first_read_share" && r.ftn_pending) return <span className="text-xs text-muted">pend.</span>;
            if (!delta) return <span className="tabular">{fmt(v, def.format)}</span>;
            if (v === null) return <span className="text-muted">–</span>;
            const scale = def.format === "pct" ? 0.15 : def.format === "int" ? 5 : 0.3;
            return (
              <span className="tabular rounded px-1.5 py-0.5 text-xs" style={{ background: divColor(v / scale), color: "#fff" }}>
                {fmtDelta(v, def.format)}
              </span>
            );
          },
        }),
      );
    }
    return base as ColumnDef<UsageRow, unknown>[];
  }, [visible, delta, season, rows]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const opponents = useMemo(() => Array.from(new Set(rows.map((r) => r.opponent).filter(Boolean))).sort() as string[], [rows]);
  const selectCls = "rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-primary";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => applyPreset(p.key)} className={`rounded-full border px-3 py-1 text-xs ${preset === p.key ? "border-accent bg-accent/15 text-primary" : "border-border bg-surface-1 text-secondary hover:text-primary"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search player" className={`${selectCls} w-40`} />
        <select value={team} onChange={(e) => setTeam(e.target.value)} className={selectCls} aria-label="Team">
          <option value="">All teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={pos} onChange={(e) => { setPos(e.target.value); setPreset(null); }} className={selectCls} aria-label="Position">
          <option value="">All positions</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="WR,TE">WR + TE</option>
          <option value="RB,FB">RB + FB</option>
        </select>
        {opponents.length > 0 && (
          <select value={opp} onChange={(e) => setOpp(e.target.value)} className={selectCls} aria-label="Opponent">
            <option value="">Any opponent</option>
            {opponents.map((o) => <option key={o} value={o}>vs {o}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          Min snap %
          <input type="range" min={0} max={0.9} step={0.05} value={minSnap} onChange={(e) => setMinSnap(Number(e.target.value))} className="w-24 accent-[var(--accent)]" />
          <span className="tabular w-8">{Math.round(minSnap * 100)}%</span>
        </label>
        {allowDelta && (
          <label className="flex items-center gap-1.5 text-xs text-secondary">
            <input type="checkbox" checked={delta} onChange={(e) => setDelta(e.target.checked)} className="accent-[var(--accent)]" />
            Change vs prior 4 weeks
          </label>
        )}
        <div className="relative ml-auto">
          <button onClick={() => setPickerOpen((o) => !o)} className={selectCls}>Columns ({visible.length})</button>
          {pickerOpen && (
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-border bg-surface-1 p-3 shadow-xl">
              {(["Snaps", "Receiving", "Backfield", "Fantasy"] as const).map((g) => (
                <div key={g} className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{g}</div>
                  {METRICS.filter((m) => m.group === g).map((m) => (
                    <label key={m.key} className="flex items-center gap-2 py-0.5 text-xs">
                      <input type="checkbox" checked={visible.includes(m.key)} onChange={(e) => { setPreset(null); setVisible((v) => (e.target.checked ? [...v, m.key] : v.filter((k) => k !== m.key))); }} className="accent-[var(--accent)]" />
                      {m.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">{filtered.length} players · {scopeLabel}{delta ? " · cells show change vs the player's prior 4-week average" : ""}</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const numeric = h.column.id in METRIC_BY_KEY;
                  return (
                    <th key={h.id} onClick={h.column.getToggleSortingHandler()} className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 font-medium hover:text-primary ${numeric ? "text-right" : "text-left"} ${sorted ? "text-primary" : ""}`}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted && <span className="ml-0.5">{sorted === "desc" ? "▾" : "▴"}</span>}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.slice(0, 400).map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-surface-2/60">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className={`whitespace-nowrap px-2 py-1.5 ${c.column.id in METRIC_BY_KEY ? "text-right" : "text-left"}`}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 400 && <p className="mt-2 text-xs text-muted">Showing the first 400 rows. Filter to narrow.</p>}
    </div>
  );
}
