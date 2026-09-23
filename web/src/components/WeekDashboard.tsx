"use client";

import { UsageTable } from "./UsageTable";
import { UsageScatter } from "./charts/UsageScatter";
import { RisersFallers } from "./charts/RisersFallers";
import type { UsageRow } from "@/lib/types";

/** Week page body: one client boundary so the row payload is serialized once. */
export function WeekDashboard({ rows, season, week, teams }: { rows: UsageRow[]; season: number; week: number; teams: string[] }) {
  return (
    <>
      <UsageTable rows={rows} season={season} teams={teams} allowDelta scopeLabel={`${season} week ${week}`} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Usage map</h2>
          <p className="mb-3 text-xs text-muted">Top right is elite usage.</p>
          <UsageScatter rows={rows} />
        </section>
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Risers and fallers</h2>
          <p className="mb-3 text-xs text-muted">Biggest changes in role this week.</p>
          <RisersFallers rows={rows} />
        </section>
      </div>
    </>
  );
}
