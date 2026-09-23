"use client";

/** Opens the OG image route for the current team/scope as a 1200x630 PNG. */
export function ExportButton({ team, scope, season }: { team: string; scope: string; season: number }) {
  const href = `/api/og/team/${team}?week=${encodeURIComponent(scope)}&season=${season}`;
  return (
    <a href={href} target="_blank" rel="noopener" download={`${team}-${season}-${scope}.png`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-primary hover:border-accent">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Export PNG
    </a>
  );
}
