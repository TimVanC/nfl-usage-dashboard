import type { UsageRow } from "./types";

/**
 * Fixed color order for a team's players: rank by season targets, then carries.
 * Every chart on the Team page uses this map so a player keeps one color.
 */
export function playerOrder(seasonRows: UsageRow[]): Record<string, number> {
  const sorted = [...seasonRows]
    .filter((r) => r.targets > 0 || r.carries > 0)
    .sort((a, b) => b.targets + b.carries * 0.5 - (a.targets + a.carries * 0.5));
  return Object.fromEntries(sorted.map((r, i) => [r.gsis_id, i]));
}
