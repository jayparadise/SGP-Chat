import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/loadCatalog";
import { parlayOdds, SPORTSBOOK } from "../../../lib/opticodds";
import { toAm, toDec } from "../../../lib/catalog";

export const dynamic = "force-dynamic";

// Reprice a set of catalog ids without touching the engine. Used when the
// user drops or re-adds legs so the slip never shows a stale or empty price.
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const { sport = "nfl", fixture_id, ids = [] } = body;
  if (!fixture_id) return NextResponse.json({ error: "fixture_id required" }, { status: 400 });
  try {
    const { rows } = await loadCatalog(sport, fixture_id);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const legs = ids.map((id) => byId[id]).filter(Boolean);
    const naive = toAm(legs.reduce((p, l) => p * toDec(l.price), 1));
    let sgp = null, sgp_error = null;
    if (legs.length >= 2) {
      try {
        const entries = legs.map((l) => ({ fixture_id, market: l.market, name: l.name, price_american: l.price }));
        const priced = await parlayOdds(entries, [SPORTSBOOK, "OpticOdds AI"]);
        sgp = Object.fromEntries(Object.entries(priced).map(([book, v]) => [book, v?.price ?? null]));
        const firstErr = Object.values(priced).find((v) => v?.error)?.error;
        if (firstErr && Object.values(sgp).every((p) => p == null)) sgp_error = firstErr;
      } catch (e) { sgp_error = String(e.message || e); }
    }
    return NextResponse.json({ pricing: { naive, sgp, sgp_error, sportsbook: SPORTSBOOK } });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
