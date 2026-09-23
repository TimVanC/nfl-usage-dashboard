import { METRICS } from "@/lib/metrics";

export const metadata = { title: "Definitions" };

const TEAM_METRICS = [
  { label: "Neutral pass rate", def: "Pass rate on plays with win probability between 20% and 80% (vegas-adjusted WP when available; one-score games otherwise). Kneels excluded.", src: "nflverse PBP" },
  { label: "Pass rate over expected (PROE)", def: "Mean of (pass − xpass) across plays, where xpass is nflverse's expected pass probability given down, distance, field position, score and time.", src: "nflverse PBP" },
  { label: "Pace", def: "Average seconds between consecutive offensive snaps within a drive, neutral situations only, gaps over 60s (timeouts, breaks) excluded.", src: "nflverse PBP" },
  { label: "Implied team total", def: "(total / 2) − (spread / 2), with spread from the team's perspective (negative = favored).", src: "nflverse schedules" },
];

export default function DefinitionsPage() {
  const groups = ["Snaps", "Receiving", "Backfield", "Fantasy"] as const;
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Definitions</h1>
        <p className="mt-1 text-sm text-secondary">Every metric on the site, how it is computed, and where it comes from. Regular season only.</p>
      </header>

      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{g}</h2>
          <dl className="card divide-y divide-border">
            {METRICS.filter((m) => m.group === g).map((m) => (
              <div key={m.key} className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-[200px_1fr]">
                <dt className="text-sm font-medium">{m.label}{m.proxy && <span className="ml-1 text-xs text-warn">proxy</span>}</dt>
                <dd className="text-sm text-secondary">{m.definition} <span className="text-muted">— {m.source}</span></dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Team context</h2>
        <dl className="card divide-y divide-border">
          {TEAM_METRICS.map((m) => (
            <div key={m.label} className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-[200px_1fr]">
              <dt className="text-sm font-medium">{m.label}</dt>
              <dd className="text-sm text-secondary">{m.def} <span className="text-muted">— {m.src}</span></dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3 text-sm text-secondary">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Notes</h2>
        <p><span className="text-primary">First-read share.</span> Uses FTN's <code className="rounded bg-surface-2 px-1">read_thrown</code> field: a target counts as a first read when read_thrown is <code className="rounded bg-surface-2 px-1">1</code> or <code className="rounded bg-surface-2 px-1">DES</code> (designed). Scramble drills (SD), checkdowns (CHK) and second-plus reads are excluded from both numerator and denominator. FTN charts games within ~48 hours; until then first-read columns show <em>pend.</em> and season/last-4 first-read shares only include charted games. FTN's definition may differ from other outlets' "first read" stats.</p>
        <p><span className="text-primary">Routes proxy.</span> nflverse participation data lists who was on the field for each play. The proxy counts team dropbacks with the player on the field, which overstates routes for blocking tight ends and pass protectors. Participation data ends after the 2025 season, so route %, targets per route and passing-down snaps are unavailable for 2026 until a route-charting license is added.</p>
        <p><span className="text-primary">Snap counts</span> come from Pro Football Reference via nflverse. Team snaps are inferred from the highest-snap player's snap percentage.</p>
        <p><span className="text-primary">Attribution.</span> Play-by-play, snap counts, participation, rosters and schedules are from <a className="text-accent hover:underline" href="https://github.com/nflverse">nflverse</a>. Charting data is from FTN Data via nflverse, licensed CC BY-SA 4.0.</p>
      </section>
    </div>
  );
}
