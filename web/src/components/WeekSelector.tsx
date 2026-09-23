"use client";

import { useRouter } from "next/navigation";

export interface WeekOption { value: string; label: string }

/** Team page scope picker: Week 1..N, Season, Last 4, Next week projection. */
export function WeekSelector({ options, value, basePath, param = "week" }: { options: WeekOption[]; value: string; basePath: string; param?: string }) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) => router.push(`${basePath}?${param}=${e.target.value}`)}
      className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
      aria-label="Scope"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
