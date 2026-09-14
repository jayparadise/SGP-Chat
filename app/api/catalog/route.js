import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/loadCatalog";

export const dynamic = "force-dynamic";

// Debug/inspection endpoint: what the engine sees for a game.
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const sport = p.get("sport") || "nfl";
  const fixtureId = p.get("fixture_id");
  if (!fixtureId) return NextResponse.json({ error: "fixture_id required" }, { status: 400 });
  try {
    const { game, rows, raw_count } = await loadCatalog(sport, fixtureId);
    return NextResponse.json({ game, count: rows.length, raw_count, rows });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
