import { NextResponse } from "next/server";
import { SPORTS } from "../../../lib/sports";
import { activeFixtures, cached } from "../../../lib/opticodds";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const sport = new URL(req.url).searchParams.get("sport") || "nfl";
  const cfg = SPORTS[sport];
  if (!cfg) return NextResponse.json({ error: `Unknown sport ${sport}` }, { status: 400 });
  try {
    const fixtures = await cached(`fx:${sport}`, 5 * 60e3, () => activeFixtures(cfg.sport, cfg.league));
    return NextResponse.json({ sport, label: cfg.label, fixtures });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
