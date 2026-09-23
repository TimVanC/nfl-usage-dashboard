import { NextResponse } from "next/server";
import { getPlayerWeeks, getSeasonStatus } from "@/lib/queries";

export const revalidate = 1800;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : (await getSeasonStatus()).season;
  const rows = await getPlayerWeeks(id, season);
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
}
