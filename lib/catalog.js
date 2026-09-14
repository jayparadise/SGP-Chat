// Curate a raw /fixtures/odds dump into a ladder the engine can reason over.
// Every player-market-side keeps its main line plus a few alts at rungs
// that mean something in a story: "a bit more" (~+170), "big" (~+300),
// "monster" (~+600). Unders keep main plus one deeper rung.

const MAX_ROWS = 380;

export const toDec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
export const toAm = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
export const fmtAm = (a) => (a > 0 ? `+${a}` : `${a}`);

const RUNGS = {
  over: [170, 300, 600],
  under: [150],
  spread: [-200, 165, 260, 420],
  total: [150],
};

function sideOf(o) {
  if (o.selection_line === "over") return "over";
  if (o.selection_line === "under") return "under";
  if (o.points != null && o.selection) return "spread";
  if (o.points != null) return "total";
  return "flat";
}

function groupKey(o) {
  return [o.market_id, o.player_id || o.normalized_selection || "", o.selection_line || ""].join("|");
}

// Pick the alt whose price is closest (in log-decimal space) to each rung,
// rejecting anything more than ~2x away from the rung.
function pickRungs(alts, rungs) {
  const out = [];
  for (const target of rungs) {
    const t = Math.log(toDec(target) - 1);
    let best = null, bestD = Infinity;
    for (const a of alts) {
      const d = Math.abs(Math.log(toDec(a.price) - 1) - t);
      if (d < bestD) { best = a; bestD = d; }
    }
    if (best && bestD < Math.log(2) && !out.includes(best)) out.push(best);
  }
  return out;
}

export function curate(fixture, odds, cfg) {
  const groups = new Map();
  for (const o of odds) {
    if (o.price == null) continue;
    const k = groupKey(o);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }

  const teamById = {};
  for (const c of fixture.home_competitors || []) teamById[c.id] = c.abbreviation || c.name;
  for (const c of fixture.away_competitors || []) teamById[c.id] = c.abbreviation || c.name;

  const marketOrder = [...cfg.core, ...cfg.props];
  const rows = [];
  for (const [, list] of groups) {
    const side = sideOf(list[0]);
    const mains = list.filter((o) => o.is_main);
    const alts = list.filter((o) => !o.is_main);
    let keep;
    if (side === "flat") keep = list;
    else if (side === "spread") keep = [...mains, ...pickRungs(alts, RUNGS.spread)];
    else if (side === "total") keep = [...mains, ...pickRungs(alts, RUNGS.total)];
    else keep = [...mains, ...pickRungs(alts, RUNGS[side])];
    // Yes/No style markets (anytime TD, HR yes/no) come through as over 0.5 with no main flag on some books.
    if (!keep.length && list.length) keep = [list.sort((a, b) => a.points - b.points)[0]];
    for (const o of keep) {
      rows.push({
        id: o.id,
        market_id: o.market_id,
        market: o.market,
        name: o.name,
        player: o.player_id ? o.selection : null,
        team: o.team_id ? teamById[o.team_id] || null : null,
        sel: o.selection || "",
        side: o.selection_line || null,
        line: o.points,
        price: o.price,
        is_main: !!o.is_main,
        _order: marketOrder.indexOf(o.market_id),
        _prop: cfg.props.includes(o.market_id),
      });
    }
  }

  // Core first, then props ordered by config, mains before alts. Trim the tail if huge.
  rows.sort((a, b) => a._prop - b._prop || a._order - b._order || (b.is_main - a.is_main) || (a.player || "").localeCompare(b.player || ""));
  const trimmed = rows.length > MAX_ROWS ? rows.filter((r, i) => i < MAX_ROWS || r.is_main) : rows;
  return trimmed.map(({ _order, _prop, ...r }) => r);
}

export function describeLeg(l) {
  if (l.player) {
    if (l.line == null) return `${l.player} ${l.market.toLowerCase()}`;
    return `${l.player} ${l.side} ${l.line} ${l.market.replace(/^Player /, "").toLowerCase()}`;
  }
  return l.name;
}

export const fmtDec = (a) => toDec(a).toFixed(2);

export function catalogText(rows) {
  return rows
    .map((r) => `${r.id} | ${r.team ?? "-"} | ${r.player ?? "-"} | ${r.market} | ${r.name} | ${fmtDec(r.price)}${r.is_main ? " | main" : ""}`)
    .join("\n");
}
