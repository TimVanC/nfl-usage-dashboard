import type { MetricFormat } from "./metrics";

export function fmt(v: number | null | undefined, format: MetricFormat): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  switch (format) {
    case "pct":
      return `${(v * 100).toFixed(v * 100 >= 10 ? 0 : 1)}%`;
    case "int":
      return Math.round(v).toString();
    case "dec1":
      return v.toFixed(1);
    case "dec2":
      return v.toFixed(2);
  }
}

export function fmtDelta(v: number | null | undefined, format: MetricFormat): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const sign = v > 0 ? "+" : "";
  if (format === "pct") return `${sign}${(v * 100).toFixed(1)}`;
  if (format === "int") return `${sign}${v.toFixed(1)}`;
  return `${sign}${v.toFixed(format === "dec1" ? 1 : 2)}`;
}

export function pct0(v: number | null | undefined): string {
  return v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`;
}

export function initials(name: string): string {
  const parts = name.replace(/\s+(Jr\.|Sr\.|II|III|IV)$/i, "").split(" ");
  return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
}

export function weekLabel(w: number | string): string {
  if (w === "season") return "Season";
  if (w === "last4") return "Last 4";
  if (w === "next") return "Next week";
  return `Week ${w}`;
}
