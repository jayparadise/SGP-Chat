import { NextResponse } from "next/server";
import { loadCatalog } from "../../../lib/loadCatalog";
import { askEngine, validate } from "../../../lib/engine";
import { parlayOdds, SPORTSBOOK } from "../../../lib/opticodds";
import { toAm, describeLeg } from "../../../lib/catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const { sport = "nfl", fixture_id, turns = [], locked = [], rejected = [] } = body;
  if (!fixture_id || !turns.length) return NextResponse.json({ error: "fixture_id and turns required" }, { status: 400 });

  try {
    const { game, rows, cfg } = await loadCatalog(sport, fixture_id);
    const parsed = await askEngine({ game, rows, cfg, turns, locked, rejected });
    const { legs, naive } = validate(parsed, rows, locked, rejected);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

    // Correlated price from the OpticOdds SGP pricer. Best effort: if the
    // book cannot combine these legs, we surface its reason instead of hiding it.
    let sgp = null, sgp_error = null;
    if (legs.length >= 2) {
      try {
        const entries = legs.map((l) => ({ fixture_id, market: byId[l.id].market, name: byId[l.id].name, price_american: byId[l.id].price }));
        const priced = await parlayOdds(entries, [SPORTSBOOK, "OpticOdds AI"]);
        sgp = Object.fromEntries(Object.entries(priced).map(([book, v]) => [book, v?.price ?? null]));
        const firstErr = Object.values(priced).find((v) => v?.error)?.error;
        if (firstErr && Object.values(sgp).every((p) => p == null)) sgp_error = firstErr;
      } catch (e) {
        sgp_error = String(e.message || e);
      }
    }

    return NextResponse.json({
      summary: parsed.summary || "",
      note: parsed.note || "",
      legs: legs.map((l) => ({ ...l, label: describeLeg(byId[l.id]), price: byId[l.id].price, market: byId[l.id].market })),
      pricing: { naive: toAm(naive), sgp, sgp_error, sportsbook: SPORTSBOOK },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 502 });
  }
}
