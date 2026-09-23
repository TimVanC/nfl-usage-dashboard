/** Categorical series colors, assigned in fixed order (never cycled). Slots past 8 fold into "Other". */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const OTHER = "#5a5b60";

export function seriesColor(i: number): string {
  return i < SERIES.length ? SERIES[i] : OTHER;
}

/** Sequential blue ramp (light -> dark) for heatmaps on the dark surface. */
export const SEQ = ["#1b2330", "#193a63", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#86b6ef"];

export function seqColor(t: number): string {
  if (t === null || Number.isNaN(t)) return "transparent";
  const i = Math.max(0, Math.min(SEQ.length - 1, Math.round(t * (SEQ.length - 1))));
  return SEQ[i];
}

/** Diverging: red (negative) -> gray -> blue (positive), t in [-1, 1]. */
export function divColor(t: number): string {
  const c = Math.max(-1, Math.min(1, t));
  const a = Math.abs(c);
  const [r0, g0, b0] = [0x38, 0x38, 0x35];
  const [r1, g1, b1] = c < 0 ? [0xe6, 0x67, 0x67] : [0x39, 0x87, 0xe5];
  const mix = (x: number, y: number) => Math.round(x + (y - x) * a);
  return `rgb(${mix(r0, r1)}, ${mix(g0, g1)}, ${mix(b0, b1)})`;
}

export function teamColor(color: string | null | undefined, fallback = "#3987e5"): string {
  if (!color) return fallback;
  return color.startsWith("#") ? color : `#${color}`;
}
