# Narrative Bet Builder

Type how you think a game goes; get a same-game parlay that tells that story. Trim legs, lock the ones you like, rebuild.

Live lines come from OpticOdds (one configurable book). Leg selection comes from Claude, constrained to a curated ladder of that game's markets and then validated in code. The correlated SGP price comes from OpticOdds' `/parlay/odds` pricer.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the two keys
npm run dev                  # http://localhost:3000
```

## Deploy on Vercel

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel (framework auto-detects as Next.js).
3. Add environment variables: `OPTICODDS_API_KEY`, `ANTHROPIC_API_KEY`, optionally `SPORTSBOOK` (default `draftkings`) and `ENGINE_MODEL`.
4. Deploy.

Keys never reach the browser: every OpticOdds and Anthropic call happens in the API routes.

## How it works

| Route | Does |
|---|---|
| `GET /api/fixtures?sport=nfl` | Upcoming and live games for that league (next 36h). Cached 5 min. |
| `GET /api/catalog?sport=nfl&fixture_id=…` | The curated market ladder the engine reasons over. Cached 90s. Useful for debugging what the model can see. |
| `POST /api/build` | `{sport, fixture_id, turns[], locked[], rejected[]}` → summary, legs with rationale, naive price, correlated SGP price. |

**Curation (`lib/catalog.js`).** For every player-market-side the ladder keeps the main line plus alts nearest to +170 / +300 / +600 (over-type), one deeper rung for unders, and a spread ladder at roughly -200 / +165 / +260 / +420. Yes/No markets keep the 0.5 line. Capped around 380 rows so the prompt stays fast.

**Engine (`lib/engine.js`).** The system prompt carries the catalog and the sport's vocabulary (`lib/sports.js`) — what "wins big" or "goes off" should map to. The model returns JSON legs with a one-line "why". `validate()` then enforces what the prompt only asks for: ids must exist, no rejected ids, one leg per player-market, no opposite sides, no cross-team side contradictions, one longshot max, locked legs always present.

**Rebuild loop.** Dropped legs accumulate in `rejected` and are never offered again; the engine finds another way to express that beat or drops it. Locked legs are passed as `locked` and must survive. Follow-up messages append to the story rather than replace it.

## Adding a league

Copy a block in `lib/sports.js`. `sport` and `league` are OpticOdds ids (`/leagues`), market ids come from `/markets?league=…&sportsbook=…`. The catalog route skips any market the book doesn't offer, so an over-inclusive list is harmless. Write the `vocab` line carefully — it is what turns fan language into the right intensity of line.

## Known gaps

- Dropping a leg is ambiguous between "not that line" and "not that angle". A two-option drop would fix it.
- Line-to-intensity mapping is done by the model. Moving it into code (model picks player + market + direction + intensity; code picks the rung) would make it deterministic and cheaper.
- The in-memory cache is per serverless instance. Fine for a prototype; use KV or Supabase for real traffic.
- "Add to betslip" is a stub. Wire it to the DST bet builder's add-legs call.
