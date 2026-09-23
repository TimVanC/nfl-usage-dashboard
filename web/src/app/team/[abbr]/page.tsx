import { notFound } from "next/navigation";
import Link from "next/link";
import { ExportButton } from "@/components/ExportButton";
import { WeekSelector } from "@/components/WeekSelector";
import { TargetShareDonut } from "@/components/charts/TargetShareDonut";
import { ShareTrendLines } from "@/components/charts/ShareTrendLines";
import { SnapRouteLines } from "@/components/charts/SnapRouteLines";
import { BackfieldStackedBars } from "@/components/charts/BackfieldStackedBars";
import { WeekGrid } from "@/components/charts/WeekGrid";
import { RedZonePanel } from "@/components/panels/RedZonePanel";
import { BackfieldSplit } from "@/components/panels/BackfieldSplit";
import { ContextStrip } from "@/components/panels/ContextStrip";
import { ProjectionsTable } from "@/components/ProjectionsTable";
import { getProjections, getSeasonStatus, getSeasons, getTeam, getTeamAllWeeks, getTeamContext, getTeamGames, getTeamScopeUsage } from "@/lib/queries";
import { playerOrder } from "@/lib/order";
import { teamColor } from "@/lib/palette";
import { weekLabel } from "@/lib/format";

export const revalidate = 1800;

export async function generateMetadata({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const team = await getTeam(abbr.toUpperCase());
  return { title: team ? `${team.name} usage` : "Team" };
}

function Card({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className ?? ""}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub && <p className="mb-3 text-xs text-muted">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </section>
  );
}

export default async function TeamPage({ params, searchParams }: { params: Promise<{ abbr: string }>; searchParams: Promise<{ week?: string; season?: string }> }) {
  const { abbr: raw } = await params;
  const abbr = raw.toUpperCase();
  const sp = await searchParams;
  const team = await getTeam(abbr);
  if (!team) notFound();

  const seasons = await getSeasons();
  const season = sp.season ? Number(sp.season) : seasons[0];
  const status = await getSeasonStatus(season);
  const latest = status.latest_week;
  const scope = sp.week ?? String(latest);
  const isNext = scope === "next";
  const weekNum = /^\d+$/.test(scope) ? Number(scope) : null;

  const [allWeeks, seasonRows, last4Rows, ctx, games] = await Promise.all([
    getTeamAllWeeks(season, abbr),
    getTeamScopeUsage(season, "season", abbr),
    getTeamScopeUsage(season, "last4", abbr),
    getTeamContext(season, abbr),
    getTeamGames(season, abbr),
  ]);
  const projections = isNext ? await getProjections(season, latest + 1, abbr) : [];
  const order = playerOrder(seasonRows);

  const scopeRows = weekNum ? allWeeks.filter((r) => r.week === weekNum) : scope === "last4" ? last4Rows : seasonRows;
  const teamTargets = weekNum ? (scopeRows[0]?.team_targets ?? 0) : scopeRows.reduce((m, r) => Math.max(m, r.team_targets ?? 0), 0);
  const playedWeeks = Array.from(new Set(allWeeks.map((r) => r.week!))).sort((a, b) => a - b);
  const last4Weeks = playedWeeks.slice(-4);
  const scopeCtx = weekNum ? ctx.filter((c) => c.week === weekNum) : scope === "last4" ? ctx.filter((c) => last4Weeks.includes(c.week)) : isNext ? ctx.filter((c) => c.week === latest + 1) : ctx.filter((c) => c.week <= latest);
  const game = weekNum ? games.find((g) => g.week === weekNum) : isNext ? games.find((g) => g.week === latest + 1) : null;
  const gameLine = game
    ? (() => {
        const home = game.home_team === abbr;
        const opp = home ? game.away_team : game.home_team;
        const pf = home ? game.home_score : game.away_score;
        const pa = home ? game.away_score : game.home_score;
        const res = game.completed && pf !== null && pa !== null ? `${pf > pa ? "W" : pf < pa ? "L" : "T"} ${pf}–${pa}` : "";
        return `${home ? "vs" : "@"} ${opp} ${res}`.trim();
      })()
    : null;

  const options = [
    ...playedWeeks.map((w) => ({ value: String(w), label: `Week ${w}` })),
    { value: "season", label: "Season" },
    { value: "last4", label: "Last 4" },
    ...(latest < status.scheduled_through ? [{ value: "next", label: `Week ${latest + 1} projection` }] : []),
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: teamColor(team.color) }}>{team.abbr}</span>
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
          <p className="text-sm text-secondary">
            {season} · {weekLabel(isNext ? "next" : scope)}{gameLine ? ` · ${gameLine}` : ""}
          </p>
        </div>
        {seasons.length > 1 && (
          <WeekSelector options={seasons.map((s) => ({ value: String(s), label: String(s) }))} value={String(season)} basePath={`/team/${abbr}`} param="season" />
        )}
        <WeekSelector options={options} value={scope} basePath={`/team/${abbr}${sp.season ? `?season=${season}&` : ""}`.replace(/&$/, "")} />
        {!isNext && <ExportButton team={abbr} scope={scope} season={season} />}
      </header>

      <ContextStrip ctx={scopeCtx} label={weekLabel(isNext ? "next" : scope)} />

      {isNext ? (
        <Card title={`Week ${latest + 1} projected volume`} sub="Team pass attempts × weighted share × injury × matchup. Drivers shown per row; reruns Wed / Fri / Sun.">
          {projections.length ? <ProjectionsTable rows={projections} season={season} compact /> : <p className="text-sm text-muted">No projections yet for this week.</p>}
          <p className="mt-2 text-xs"><Link href="/projections" className="text-accent hover:underline">All teams →</Link></p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            <Card title="Target share" sub={`${weekLabel(scope)} · targets / team targets`} className="lg:col-span-3">
              <TargetShareDonut rows={scopeRows} order={order} season={season} teamTargets={teamTargets} />
            </Card>
            <Card title="Red zone" sub="Targets and carries inside the 20" className="lg:col-span-2">
              <RedZonePanel rows={scopeRows} season={season} />
            </Card>
          </div>

          <Card title="Backfield split" sub="Carry share = carries / team RB carries. RB target share = targets / team RB targets.">
            <BackfieldSplit rows={scopeRows} season={season} />
          </Card>

          <Card title="Week-by-week" sub="Cells are the selected metric; last two columns are season and last-4 averages.">
            <WeekGrid rows={allWeeks} season={seasonRows} last4={last4Rows} seasonNum={season} order={order} />
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card title="Share trends" sub="One line per player, by week.">
              <ShareTrendLines rows={allWeeks} order={order} />
            </Card>
            <Card title="Snap % vs route % (proxy)" sub="A widening gap flags a blocking TE or a rotational role.">
              <SnapRouteLines rows={allWeeks} order={order} />
            </Card>
          </div>

          <Card title="Backfield carry share by week" sub="Stacked to 100% of team RB carries. Numbers on segments are inside-5 carries.">
            <BackfieldStackedBars rows={allWeeks} order={order} />
          </Card>
        </>
      )}
    </div>
  );
}
