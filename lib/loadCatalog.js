import { SPORTS } from "./sports";
import { fixtureOdds, cached, SPORTSBOOK } from "./opticodds";
import { curate } from "./catalog";

export async function loadCatalog(sport, fixtureId) {
  const cfg = SPORTS[sport];
  if (!cfg) throw new Error(`Unknown sport ${sport}`);
  return cached(`cat:${sport}:${fixtureId}`, 90e3, async () => {
    const { fixture, odds } = await fixtureOdds(fixtureId, [...cfg.core, ...cfg.props]);
    if (!fixture) throw new Error("No odds available for this fixture right now");
    const rows = curate(fixture, odds, cfg);
    const game = {
      id: fixture.id,
      home: fixture.home_team_display || fixture.home_competitors?.[0]?.name,
      away: fixture.away_team_display || fixture.away_competitors?.[0]?.name,
      start_date: fixture.start_date,
      status: fixture.status,
      sportsbook: SPORTSBOOK,
    };
    return { game, rows, cfg, raw_count: odds.length };
  });
}
