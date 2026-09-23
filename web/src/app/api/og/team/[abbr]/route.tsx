import { ImageResponse } from "next/og";
import { getSeasonStatus, getSeasons, getTeam, getTeamAllWeeks, getTeamScopeUsage } from "@/lib/queries";
import { playerOrder } from "@/lib/order";
import { seriesColor, OTHER, teamColor } from "@/lib/palette";
import { weekLabel } from "@/lib/format";

export const revalidate = 1800;

const W = 1200, H = 630;
const SOURCE = process.env.NEXT_PUBLIC_AVATAR_SOURCE ?? "headshot";

function sector(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  const P = (rad: number, a: number) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const [x0, y0] = P(R, a0), [x1, y1] = P(R, a1), [x2, y2] = P(r, a1), [x3, y3] = P(r, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** 1200x630 PNG: target-share donut + red zone + backfield for one team/scope. */
export async function GET(req: Request, { params }: { params: Promise<{ abbr: string }> }) {
  const { abbr: raw } = await params;
  const abbr = raw.toUpperCase();
  const url = new URL(req.url);
  const seasons = await getSeasons();
  const season = Number(url.searchParams.get("season") ?? seasons[0]);
  const status = await getSeasonStatus(season);
  const scope = url.searchParams.get("week") ?? String(status.latest_week);
  const weekNum = /^\d+$/.test(scope) ? Number(scope) : null;
  const team = await getTeam(abbr);
  if (!team) return new Response("Not found", { status: 404 });

  const [seasonRows, scopeRows] = await Promise.all([
    getTeamScopeUsage(season, "season", abbr),
    weekNum ? getTeamAllWeeks(season, abbr).then((r) => r.filter((x) => x.week === weekNum)) : getTeamScopeUsage(season, scope === "last4" ? "last4" : "season", abbr),
  ]);
  const order = playerOrder(seasonRows);
  const targeted = scopeRows.filter((r) => r.targets > 0).sort((a, b) => b.targets - a.targets);
  const top = targeted.filter((r) => (order[r.gsis_id] ?? 99) < 8).slice(0, 8);
  const other = targeted.filter((r) => (order[r.gsis_id] ?? 99) >= 8).reduce((s, r) => s + r.targets, 0);
  const total = targeted.reduce((s, r) => s + r.targets, 0) || 1;
  const rz = scopeRows.filter((r) => r.rz_targets + r.rz_carries > 0).sort((a, b) => b.rz_targets + b.rz_carries - (a.rz_targets + a.rz_carries)).slice(0, 5);
  const rbs = scopeRows.filter((r) => ["RB", "FB"].includes(r.position ?? "") && r.carries > 0).sort((a, b) => b.carries - a.carries).slice(0, 4);
  const opp = weekNum ? scopeRows[0]?.opponent : null;

  // Satori (next/og) rules: every multi-child div needs display:flex, numbers must be stringified, no SVG <text>.
  // donut geometry
  const cx = 150, cy = 150, R = 130, r = 82;
  let a = -Math.PI / 2;
  const slices = [...top.map((p) => ({ v: p.targets, c: seriesColor(order[p.gsis_id]) })), ...(other ? [{ v: other, c: OTHER }] : [])].map((s) => {
    const a0 = a, a1 = a + (s.v / total) * Math.PI * 2 - 0.02;
    a = a1 + 0.02;
    return { ...s, d: sector(cx, cy, R, r, a0, a1) };
  });

  const color = teamColor(team.color);
  const pct = (v: number | null) => `${Math.round((v ?? 0) * 100)}%`;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#0f1012", color: "#f4f4f2", fontFamily: "sans-serif", padding: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff" }}>{abbr}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 700 }}>{`${team.name} usage`}</div>
            <div style={{ fontSize: 18, color: "#b9b9b3" }}>{`${season} · ${weekLabel(scope)}${opp ? ` vs ${opp}` : ""}`}</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 18, color: "#7d7d78", display: "flex" }}><span>NFL</span><span style={{ color: "#3987e5" }}>Usage</span></div>
        </div>

        <div style={{ display: "flex", flex: 1, marginTop: 24, gap: 28 }}>
          {/* donut */}
          <div style={{ display: "flex", position: "relative", width: 300, height: 300 }}>
            <svg width={300} height={300} viewBox="0 0 300 300">
              {slices.map((s, i) => <path key={i} d={s.d} fill={s.c} />)}
            </svg>
            <div style={{ position: "absolute", top: 0, left: 0, width: 300, height: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 700 }}>{String(total)}</div>
              <div style={{ fontSize: 14, color: "#7d7d78" }}>team targets</div>
            </div>
          </div>
          {/* legend */}
          <div style={{ display: "flex", flexDirection: "column", width: 330, gap: 8, justifyContent: "center" }}>
            {top.map((p) => (
              <div key={p.gsis_id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: seriesColor(order[p.gsis_id]) }} />
                {SOURCE === "headshot" && p.headshot_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.headshot_url} width={30} height={30} style={{ borderRadius: 15, objectFit: "cover", background: "#1f2125" }} alt="" />
                ) : (
                  <div style={{ width: 30, height: 30, borderRadius: 15, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{p.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div>
                )}
                <div style={{ display: "flex", flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>{p.name}</div>
                <div style={{ fontWeight: 700 }}>{pct(p.target_share)}</div>
                <div style={{ width: 34, textAlign: "right", color: "#7d7d78", fontSize: 14 }}>{String(p.targets)}</div>
              </div>
            ))}
            {other > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: "#b9b9b3" }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: OTHER }} />
                <div style={{ width: 30 }} />
                <div style={{ display: "flex", flex: 1 }}>Other</div>
                <div style={{ fontWeight: 700 }}>{`${Math.round((other / total) * 100)}%`}</div>
                <div style={{ width: 34, textAlign: "right", color: "#7d7d78", fontSize: 14 }}>{String(other)}</div>
              </div>
            )}
          </div>
          {/* panels */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", background: "#17181b", border: "1px solid #2a2c31", borderRadius: 12, padding: 16, flex: 1 }}>
              <div style={{ fontSize: 14, color: "#7d7d78", textTransform: "uppercase", letterSpacing: 1 }}>Red zone (tgt · car)</div>
              {rz.map((p) => (
                <div key={p.gsis_id} style={{ display: "flex", fontSize: 17, marginTop: 8, gap: 8 }}>
                  <div style={{ display: "flex", flex: 1 }}>{p.name}</div>
                  <div style={{ color: "#3987e5", fontWeight: 700 }}>{String(p.rz_targets)}</div>
                  <div style={{ color: "#7d7d78" }}>·</div>
                  <div style={{ color: "#d95926", fontWeight: 700 }}>{String(p.rz_carries)}</div>
                </div>
              ))}
              {rz.length === 0 && <div style={{ fontSize: 15, color: "#7d7d78", marginTop: 8 }}>No red zone touches</div>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", background: "#17181b", border: "1px solid #2a2c31", borderRadius: 12, padding: 16, flex: 1 }}>
              <div style={{ fontSize: 14, color: "#7d7d78", textTransform: "uppercase", letterSpacing: 1 }}>Backfield (carry share · in-5)</div>
              {rbs.map((p) => (
                <div key={p.gsis_id} style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                  <div style={{ display: "flex", fontSize: 17, gap: 8 }}>
                    <div style={{ display: "flex", flex: 1 }}>{p.name}</div>
                    <div style={{ fontWeight: 700 }}>{pct(p.carry_share)}</div>
                    <div style={{ color: "#7d7d78" }}>{`· ${p.inside5_carries}`}</div>
                  </div>
                  <div style={{ display: "flex", height: 6, background: "#2a2c31", borderRadius: 3, marginTop: 4 }}>
                    <div style={{ width: `${Math.round((p.carry_share ?? 0) * 100)}%`, background: seriesColor(order[p.gsis_id]), borderRadius: 3 }} />
                  </div>
                </div>
              ))}
              {rbs.length === 0 && <div style={{ fontSize: 15, color: "#7d7d78", marginTop: 8 }}>No carries</div>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 12, color: "#7d7d78", marginTop: 10 }}>Data: nflverse · FTN Data charting via nflverse (CC BY-SA 4.0)</div>
      </div>
    ),
    { width: W, height: H },
  );
}
