import { ProjectionsTable } from "@/components/ProjectionsTable";
import { getProjectionAccuracy, getProjections, getSeasonStatus, getTeams } from "@/lib/queries";

export const revalidate = 1800;
export const metadata = { title: "Projections" };

export default async function ProjectionsPage() {
  const status = await getSeasonStatus();
  const week = status.latest_week + 1;
  const [rows, teams, accuracy] = await Promise.all([getProjections(status.season, week), getTeams(), getProjectionAccuracy(status.season)]);
  const runAt = rows[0]?.run_at ? new Date(rows[0].run_at) : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Week {week} projected volume</h1>
        <p className="text-sm text-secondary">
          Targets and carries, not fantasy points. ProjTargets = team pass attempts × weighted share × injury adj × matchup adj.
          {runAt && <span className="text-muted"> Run {runAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET; reruns Fri night and Sun 10am ET as injury designations settle.</span>}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="card p-6 text-sm text-muted">No projections available yet for week {week}.</p>
      ) : (
        <ProjectionsTable rows={rows} season={status.season} teams={teams.map((t) => t.abbr)} />
      )}

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Model v1</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-secondary">
          <li><span className="text-primary">Team pass attempts:</span> least-squares regression on implied team total, spread, neutral pass rate and pace (2022–present team-weeks). Trailing teams pass more, so the spread matters.</li>
          <li><span className="text-primary">Weighted share:</span> exponentially weighted target share over the last 6 games (decay 0.8), blended 70/30 with first-read share, which is more stable week to week.</li>
          <li><span className="text-primary">Injury redistribution:</span> Out / Doubtful / IR players (nflverse reports + Sleeper live status) have their share redistributed: 70% within the position group, 30% across the other skill positions, proportional to existing share.</li>
          <li><span className="text-primary">Matchup:</span> opponent targets allowed per game by position (WR / TE / RB) vs league average, shrunk toward 1.0 by games / (games + 4).</li>
          <li><span className="text-primary">Carries:</span> same structure with projected rush attempts and carry share.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">Ranges are ±30% of the point estimate (v1 placeholder until backtests produce calibrated intervals).</p>
      </section>

      {accuracy.length > 0 && (
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Accuracy log</h2>
          <p className="mb-2 text-xs text-muted">Mean absolute error of the last run before kickoff vs actual volume.</p>
          <table className="tabular text-sm">
            <thead className="text-xs text-muted"><tr><th className="pr-6 text-left font-medium">Week</th><th className="pr-6 text-right font-medium">Players</th><th className="pr-6 text-right font-medium">MAE targets</th><th className="text-right font-medium">MAE carries</th></tr></thead>
            <tbody>
              {accuracy.map((a) => (
                <tr key={a.week} className="border-t border-border"><td className="py-1 pr-6">{a.week}</td><td className="pr-6 text-right">{a.n_players}</td><td className="pr-6 text-right">{a.mae_targets?.toFixed(2)}</td><td className="text-right">{a.mae_carries?.toFixed(2) ?? "–"}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
