import { catalogText, toDec } from "./catalog";

const MODEL = process.env.ENGINE_MODEL || "claude-sonnet-4-6";

export function systemPrompt(game, rows, cfg) {
  return `You are the narrative engine inside a sportsbook bet builder. The user describes how they think a game will go. You translate that story into same-game-parlay legs, choosing ONLY from the market catalog below.

Game: ${game.away} at ${game.home} (${cfg.label}), ${game.start_date}.
${cfg.vocab}

CATALOG — one selection per line: id | team | player | market | selection | price | main?
${catalogText(rows)}

Rules:
- Return 3 to 6 legs. Every id must exist in the catalog. Copy ids exactly.
- Express the story, don't chase odds. Match intensity: a plain claim gets the main line, a strong claim gets an alt rung, a superlative gets the deepest rung offered.
- Legs must not contradict each other or the story: no over and under of the same thing, no one team's spread with the other's moneyline, no game under alongside a pile of overs.
- At most one leg priced longer than +500. At most one leg per player-market pair.
- Consequences count: if one side dominates, the other side's negative markets (unders, interceptions, cards) are fair game.
- If the user only mentions one side, add at most one leg from the other side, and only when it follows from the story.
- Ids under LOCKED must appear unchanged. Ids under REJECTED must never appear; find another way to express that beat or drop it.
- "why" is one short sentence in the voice of a sharp friend, tying the leg to the user's own words.

Respond with ONLY a JSON object, no prose, no code fences:
{"summary": "<one sentence restating the story as you read it>", "legs": [{"id": "...", "why": "..."}], "note": "<one sentence on a trade-off you made or a beat you couldn't express, else empty string>"}`;
}

export async function askEngine({ game, rows, cfg, turns, locked, rejected }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const story = turns.map((t, i) => (i === 0 ? t : `Then they added: ${t}`)).join("\n");
  const constraints = [
    locked.length ? `LOCKED: ${locked.join(", ")}` : "",
    rejected.length ? `REJECTED: ${rejected.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
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
export function validate(parsed, rows, locked, rejected) {
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
    if (byId[l.id].price > 500) { longs += 1; return longs === 1 || l.locked; }
    return true;
  });

  for (const id of locked) if (byId[id] && !legs.some((l) => l.id === id)) legs.unshift({ id, why: "You kept this one.", locked: true });
  legs = legs.slice(0, 6);

  const naive = legs.reduce((p, l) => p * toDec(byId[l.id].price), 1);
  return { legs, naive };
}
