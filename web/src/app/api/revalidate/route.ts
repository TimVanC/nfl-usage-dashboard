import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/** Called by the ETL workflow after a run so pages refresh before their 30-min window. */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const provided = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-revalidate-secret");
  if (!secret || provided !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, revalidated: new Date().toISOString() });
}
