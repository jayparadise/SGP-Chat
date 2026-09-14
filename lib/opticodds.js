const BASE = "https://api.opticodds.com/api/v3";

function key() {
  const k = process.env.OPTICODDS_API_KEY;
  if (!k) throw new Error("OPTICODDS_API_KEY is not set");
  return k;
}

export const SPORTSBOOK = process.env.SPORTSBOOK || "draftkings";

// Repeated query params for arrays (sportsbook=X&sportsbook=Y), never comma-joined.
function url(path, params = {}) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else u.searchParams.set(k, v);
  }
  return u.toString();
}

async function get(path, params) {
  const res = await fetch(url(path, params), {
    headers: { "X-Api-Key": key() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OpticOdds ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "X-Api-Key": key(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OpticOdds ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── tiny TTL cache (per serverless instance; good enough for a prototype) ──
const store = new Map();
export async function cached(k, ttlMs, fn) {
  const hit = store.get(k);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  store.set(k, { val, exp: Date.now() + ttlMs });
  return val;
}

// Upcoming + live fixtures for a league within the next `hours`.
export async function activeFixtures(sport, league, hours = 36) {
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3600e3);
  const data = await get("/fixtures/active", {
    sport,
    league,
    sportsbook: SPORTSBOOK,
    start_date_after: new Date(now.getTime() - 4 * 3600e3).toISOString(),
    start_date_before: until.toISOString(),
  });
  return (data.data || [])
    .filter((f) => f.status !== "completed" && f.status !== "cancelled")
    .map((f) => ({
      id: f.id,
      start_date: f.start_date,
      status: f.status,
      is_live: f.is_live,
      home: f.home_team_display || f.home_competitors?.[0]?.name,
      away: f.away_team_display || f.away_competitors?.[0]?.name,
      home_id: f.home_competitors?.[0]?.id,
      away_id: f.away_competitors?.[0]?.id,
      home_abbr: f.home_competitors?.[0]?.abbreviation,
      away_abbr: f.away_competitors?.[0]?.abbreviation,
    }));
}

// All odds for one fixture across a list of markets (single book).
// /fixtures/odds caps markets per call generously, but we chunk to be safe.
export async function fixtureOdds(fixtureId, markets) {
  const chunks = [];
  for (let i = 0; i < markets.length; i += 6) chunks.push(markets.slice(i, i + 6));
  const results = await Promise.all(
    chunks.map((m) => get("/fixtures/odds", { fixture_id: fixtureId, sportsbook: SPORTSBOOK, market: m }))
  );
  let fixture = null;
  const odds = [];
  for (const r of results) {
    const f = r.data?.[0];
    if (!f) continue;
    fixture = fixture || f;
    odds.push(...(f.odds || []));
  }
  return { fixture, odds };
}

// Correlated SGP price. entries: [{fixture_id, market (display name), name (odd display name), price_american?}]
export async function parlayOdds(entries, sportsbooks) {
  const data = await post("/parlay/odds", { sportsbooks, entries, odds_format: "AMERICAN" });
  return data.data || {};
}
