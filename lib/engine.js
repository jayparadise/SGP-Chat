import { catalogText, toDec } from "./catalog";

const MODEL = process.env.ENGINE_MODEL || "claude-sonnet-4-6";

export function systemPrompt(game, rows, cfg) {
  return `You are the narrative engine inside a sportsbook bet builder. The user describes how they think a game will go. You translate that story into same-game-parlay legs, choosing ONLY from the market catalog below.

Game: ${game.away} at ${game.home} (${cfg.label}), ${game.start_date}.
${cfg.vocab}

CATALOG — one selection per line: id | team | player | market | selection | decimal price | main?
${catalogText(rows)}

Rules:
- Default to 3 to 6 legs. Every id must exist in the catalog. Copy ids exactly.
- The user may state constraints in plain language: a leg count ("at least 5 legs", "keep it to 3"), or a target price ("minimum +1500", "at least 15.0", "I want a 20x"). Read them, put them in "constraints", and build to them. American odds like +1500 mean decimal 16.00. If a price target is set, climb to deeper rungs and add legs (up to 8) until the straight multiply of your legs clears it; the +5.00 single-leg cap below is relaxed to two such legs when a price target is set.
- Express the story, don't chase odds. Match intensity: a plain claim gets the main line, a strong claim gets an alt rung, a superlative gets the deepest rung offered.
- Legs must not contradict each other or the story: no over and under of the same thing, no one team's spread with the other's moneyline, no game under alongside a pile of overs.
- At most one leg priced above 6.00 (two if a price target is set). At most one leg per player-market pair.
- Consequences count: if one side dominates, the other side's negative markets (unders, interceptions, cards) are fair game.
- If the user only mentions one side, add at most one leg from the other side, and only when it follows from the story.
- Ids under LOCKED must appear unchanged. Ids under REJECTED must never appear; find another way to express that beat or drop it.
- "why" is one short sentence in the voice of a sharp friend, tying the leg to the user's own words.

Respond with ONLY a JSON object, no prose, no code fences:
{"title": "<3-5 word slip name, like a friend naming the bet: 'Chiefs Double Dip', 'Mahomes Cooks'>", "summary": "<one sentence restating the story as you read it>", "constraints": {"min_legs": <int or null>, "max_legs": <int or null>, "min_price": <decimal number or null>}, "legs": [{"id": "...", "why": "..."}], "note": "<one sentence on a trade-off you made or a beat you couldn't express, else empty string>"}`;
}

export async function askEngine({ game, rows, cfg, turns, locked, rejected, feedback }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const story = turns.map((t, i) => (i === 0 ? t : `Then they added: ${t}`)).join("\n");
  const constraints = [
    locked.length ? `LOCKED: ${locked.join(", ")}` : "",
    rejected.length ? `REJECTED: ${rejected.join(", ")}` : "",
    feedback ? `FEEDBACK ON YOUR LAST ATTEMPT: ${feedback}` : "",
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      system: systemPrompt(game, rows, cfg),
      messages: [{ role: "user", content: `STORY:\n${story}\n${constraints}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(start, end + 1));
}

// Deterministic guardrails. The prompt asks nicely; this enforces.
export function normalizeConstraints(c) {
  const out = { min_legs: null, max_legs: null, min_price: null };
  if (!c || typeof c !== "object") return out;
  const n = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
  out.min_legs = n(c.min_legs); out.max_legs = n(c.max_legs);
  let mp = n(c.min_price);
  if (mp != null && mp >= 100) mp = toDec(mp); // model slipped an American number through
  out.min_price = mp;
  if (out.min_legs != null) out.min_legs = Math.min(Math.max(2, Math.round(out.min_legs)), 8);
  if (out.max_legs != null) out.max_legs = Math.min(Math.max(2, Math.round(out.max_legs)), 8);
  return out;
}

export function validate(parsed, rows, locked, rejected, constraints = {}) {
  const c = normalizeConstraints(constraints);
  const capLegs = Math.max(c.max_legs ?? 6, c.min_legs ?? 0, 6);
  const longCap = c.min_price != null ? 2 : 1;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const seen = new Set();
  const pairSeen = new Set(); // player|market_id
  const groupSide = new Map(); // market_id|player|line → side

  let legs = [];
  for (const l of parsed.legs || []) {
    const r = byId[l.id];
    if (!r || rejected.includes(l.id) || seen.has(l.id)) continue;
    const pair = `${r.player || r.sel}|${r.market_id}`;
    if (pairSeen.has(pair)) continue;
    // opposite sides of the same market/player
    const g = `${r.market_id}|${r.player || r.sel}`;
    if (groupSide.has(g) && groupSide.get(g) !== r.side) continue;
    seen.add(l.id);
    pairSeen.add(pair);
    groupSide.set(g, r.side);
    legs.push({ id: l.id, why: l.why || "", locked: locked.includes(l.id) });
  }

  // Team-side contradictions: moneyline on one team + spread favouring the other.
  const sideTeams = legs
    .map((l) => byId[l.id])
    .filter((r) => (r.market_id === "moneyline" || /spread|run_line|puck_line|handicap/.test(r.market_id)) && r.sel)
    .map((r) => ({ team: r.sel, fav: r.market_id === "moneyline" ? true : (r.line ?? 0) < 0 }));
  const favs = new Set(sideTeams.filter((s) => s.fav).map((s) => s.team));
  if (favs.size > 1) {
    // keep the first favoured team's legs, drop the rest
    const keepTeam = sideTeams.find((s) => s.fav).team;
    legs = legs.filter((l) => {
      const r = byId[l.id];
      const isSide = (r.market_id === "moneyline" || /spread|run_line|puck_line|handicap/.test(r.market_id)) && r.sel;
      return !isSide || r.sel === keepTeam || (r.line ?? 0) > 0;
    });
  }

  // One long shot max
  let longs = 0;
  legs = legs.filter((l) => {
    if (byId[l.id].price > 500) { longs += 1; return longs <= longCap || l.locked; }
    return true;
  });

  for (const id of locked) if (byId[id] && !legs.some((l) => l.id === id)) legs.unshift({ id, why: "You kept this one.", locked: true });
  legs = legs.slice(0, capLegs);

  const naive = legs.reduce((p, l) => p * toDec(byId[l.id].price), 1);
  const unmet = [];
  if (c.min_legs != null && legs.length < c.min_legs) unmet.push(`only ${legs.length} legs, user wants at least ${c.min_legs}`);
  if (c.min_price != null && naive < c.min_price) unmet.push(`straight multiply is ${naive.toFixed(2)}, user wants at least ${c.min_price.toFixed(2)} — use deeper rungs or add legs`);
  return { legs, naive, constraints: c, unmet };
}
