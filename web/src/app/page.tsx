import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getSeasonStatus, getTeams, getWeekLeadersByTeam } from "@/lib/queries";
import { teamColor } from "@/lib/palette";
import { pct0 } from "@/lib/format";

export const revalidate = 1800;

export default async function Home() {
  const status = await getSeasonStatus();
  const [teams, leaders] = await Promise.all([getTeams(), getWeekLeadersByTeam(status.season, status.latest_week)]);
  const byTeam = Object.fromEntries(leaders.map((l) => [l.team, l]));
  const divisions = ["AFC East", "AFC North", "AFC South", "AFC West", "NFC East", "NFC North", "NFC South", "NFC West"];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Who is getting the ball?</h1>
          <p className="mt-1 text-sm text-secondary">
            {status.season} · Week {status.latest_week} usage for all 32 teams.
            {status.updated_at && <span className="text-muted"> Updated {new Date(status.updated_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET.</span>}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href={`/week?week=${status.latest_week}`} className="rounded-md border border-border bg-surface-1 px-3 py-1.5 hover:border-accent">Week {status.latest_week} table</Link>
          <Link href="/projections" className="rounded-md border border-border bg-surface-1 px-3 py-1.5 hover:border-accent">Week {status.latest_week + 1} projections</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {divisions.map((div) => (
          <section key={div}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{div}</h2>
            <ul className="space-y-2">
              {teams.filter((t) => `${t.conference} ${t.division?.split(" ").slice(-1)[0]}` === div).map((t) => {
                const l = byTeam[t.abbr];
                return (
                  <li key={t.abbr}>
                    <Link href={`/team/${t.abbr}`} className="card flex items-center gap-3 p-3 transition hover:border-accent">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: teamColor(t.color) }}>{t.abbr}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.nick}</div>
                        {l ? (
                          <div className="flex items-center gap-1.5 text-xs text-secondary">
                            <Avatar name={l.name} src={l.headshot_url} size={16} />
                            <span className="truncate">{l.name}</span>
                            <span className="tabular ml-auto font-medium text-primary">{pct0(l.target_share)}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-muted">Bye</div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
