import { WeekDashboard } from "@/components/WeekDashboard";
import { WeekSelector } from "@/components/WeekSelector";
import { getLeagueWeek, getSeasonStatus, getSeasons, getTeams } from "@/lib/queries";

export const revalidate = 1800;
export const metadata = { title: "Week table" };

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ week?: string; season?: string }> }) {
  const sp = await searchParams;
  const seasons = await getSeasons();
  const season = sp.season ? Number(sp.season) : seasons[0];
  const status = await getSeasonStatus(season);
  const week = sp.week ? Number(sp.week) : status.latest_week;
  const [rows, teams] = await Promise.all([getLeagueWeek(season, week), getTeams()]);
  const weeks = Array.from({ length: status.latest_week }, (_, i) => i + 1);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Week {week}</h1>
          <p className="text-sm text-secondary">Every skill player, every team. Sort any column; presets on the left.</p>
        </div>
        {seasons.length > 1 && <WeekSelector options={seasons.map((s) => ({ value: String(s), label: String(s) }))} value={String(season)} basePath="/week" param="season" />}
        <WeekSelector options={weeks.map((w) => ({ value: String(w), label: `Week ${w}` }))} value={String(week)} basePath={`/week${sp.season ? `?season=${season}&` : ""}`.replace(/&$/, "")} />
      </header>

      <WeekDashboard rows={rows} season={season} week={week} teams={teams.map((t) => t.abbr)} />
    </div>
  );
}
