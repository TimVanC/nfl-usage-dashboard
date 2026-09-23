import { UsageTable } from "@/components/UsageTable";
import { UsageScatter } from "@/components/charts/UsageScatter";
import { RangeControl } from "@/components/RangeControl";
import { WeekSelector } from "@/components/WeekSelector";
import { getLeagueRange, getLeagueScope, getSeasonStatus, getSeasons, getTeams } from "@/lib/queries";

export const revalidate = 1800;
export const metadata = { title: "Season table" };

export default async function SeasonPage({ searchParams }: { searchParams: Promise<{ scope?: string; from?: string; to?: string; season?: string }> }) {
  const sp = await searchParams;
  const seasons = await getSeasons();
  const season = sp.season ? Number(sp.season) : seasons[0];
  const status = await getSeasonStatus(season);
  const latest = status.latest_week;
  const from = sp.from ? Number(sp.from) : 1;
  const to = sp.to ? Number(sp.to) : latest;
  const scope = sp.from || sp.to ? "range" : sp.scope === "last4" ? "last4" : "season";
  const [rows, teams] = await Promise.all([
    scope === "range" ? getLeagueRange(season, from, to) : getLeagueScope(season, scope),
    getTeams(),
  ]);
  const label = scope === "range" ? `weeks ${from}–${to}` : scope === "last4" ? "last 4 games" : `season to date (through week ${latest})`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">{season} season</h1>
          <p className="text-sm text-secondary">Totals and shares over {label}.</p>
        </div>
        {seasons.length > 1 && <WeekSelector options={seasons.map((s) => ({ value: String(s), label: String(s) }))} value={String(season)} basePath="/season" param="season" />}
        <RangeControl latest={latest} from={from} to={to} scope={scope} season={sp.season ? season : undefined} />
      </header>

      <UsageTable rows={rows} season={season} teams={teams.map((t) => t.abbr)} scopeLabel={`${season} ${label}`} />

      <section className="card p-4">
        <h2 className="text-sm font-semibold">Usage map</h2>
        <p className="mb-3 text-xs text-muted">Target share vs air yards share over {label}.</p>
        <UsageScatter rows={rows} minTargets={Math.max(5, 3 * (scope === "range" ? to - from + 1 : scope === "last4" ? 4 : latest))} />
      </section>
    </div>
  );
}
