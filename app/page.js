"use client";
import { useEffect, useRef, useState } from "react";

const SPORT_TABS = [
  ["nfl", "NFL"], ["ncaaf", "NCAAF"], ["nba", "NBA"], ["mlb", "MLB"], ["nhl", "NHL"], ["epl", "Premier League"],
];

const EXAMPLES = {
  nfl: ["Home team wins big and the QB has a huge game", "Low-scoring slugfest decided on the ground", "Shootout — both QBs go over 275"],
  ncaaf: ["Favorite covers easily and runs it 40 times", "Upset — the dog's QB has the game of his life"],
  nba: ["Star goes for 40 and they blow the doors off", "Grind-it-out game, under the total, home team squeaks by"],
  mlb: ["Ace dominates, 8+ Ks, and the offense chips in just enough", "Slugfest — bullpens get torched, over the total"],
  nhl: ["Goalie stands on his head, 1-0 or 2-1 win", "Track meet — over the total, top line feasts"],
  epl: ["Home side dominates possession and wins to nil", "Scrappy 1-1, lots of cards, few shots on target"],
};

const fmtAm = (a) => (a == null ? "—" : a > 0 ? `+${Math.round(a)}` : `${Math.round(a)}`);
const fmtTime = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export default function Page() {
  const [sport, setSport] = useState("nfl");
  const [fixtures, setFixtures] = useState(null);
  const [fxErr, setFxErr] = useState("");
  const [game, setGame] = useState(null);

  useEffect(() => {
    setFixtures(null); setFxErr(""); setGame(null);
    fetch(`/api/fixtures?sport=${sport}`).then((r) => r.json()).then((d) => {
      if (d.error) setFxErr(d.error); else setFixtures(d.fixtures);
    }).catch((e) => setFxErr(String(e)));
  }, [sport]);

  return (
    <div className="shell">
      <header className="top">
        <div>
          <div className="sub">Narrative bet builder · prototype</div>
          <h1>{game ? `${game.away} at ${game.home}` : "Pick a game"}</h1>
        </div>
        <nav className="tabs">
          {SPORT_TABS.map(([k, l]) => (
            <button key={k} className={`tab ${k === sport ? "on" : ""}`} onClick={() => setSport(k)}>{l}</button>
          ))}
        </nav>
      </header>

      {!game ? (
        <div className="games">
          {fxErr && <div className="hint">Couldn't load games: {fxErr}</div>}
          {!fixtures && !fxErr && <div className="hint">Loading today's games…</div>}
          {fixtures && fixtures.length === 0 && <div className="hint">Nothing on the board for the next 36 hours.</div>}
          {fixtures?.map((f) => (
            <button key={f.id} className={`game ${f.is_live ? "live" : ""}`} onClick={() => setGame(f)}>
              <div className="t">{f.away} at {f.home}</div>
              <div className="m">{f.is_live ? "Live now" : fmtTime(f.start_date)}</div>
            </button>
          ))}
        </div>
      ) : (
        <Builder key={game.id} sport={sport} game={game} examples={EXAMPLES[sport] || []} onBack={() => setGame(null)} />
      )}
    </div>
  );
}

function Builder({ sport, game, examples, onBack }) {
  const [turns, setTurns] = useState([]);
  const [feed, setFeed] = useState([]);
  const [legs, setLegs] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [input, setInput] = useState("");
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [feed, loading]);

  const lockedIds = legs.filter((l) => l.locked).map((l) => l.id);

  async function run(nextTurns, locked, rej, label) {
    setLoading(true); setDirty(false);
    try {
      const r = await fetch("/api/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, fixture_id: game.id, turns: nextTurns, locked, rejected: rej }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setLegs(r.legs); setPricing(r.pricing);
      setFeed((f) => [...f, { role: "engine", summary: r.summary, note: r.note, count: r.legs.length, label }]);
    } catch (e) {
      setFeed((f) => [...f, { role: "engine", error: String(e.message || e) }]);
    } finally { setLoading(false); }
  }

  function send(text) {
    const t = text.trim(); if (!t || loading) return;
    const nextTurns = [...turns, t];
    setTurns(nextTurns); setInput("");
    setFeed((f) => [...f, { role: "user", text: t }]);
    run(nextTurns, lockedIds, rejected);
  }
  function drop(id) { setLegs((ls) => ls.filter((l) => l.id !== id)); setRejected((r) => [...r, id]); setDirty(true); setPricing(null); }
  function lock(id) { setLegs((ls) => ls.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l))); }
  function rebuild() {
    setFeed((f) => [...f, { role: "user", meta: true, text: `Rebuild — keep ${lockedIds.length}, drop ${rejected.length}.` }]);
    run(turns, lockedIds, rejected, "rebuilt");
  }

  const bookPrice = pricing?.sgp?.[Object.keys(pricing.sgp || {}).find((k) => k.toLowerCase() !== "opticodds ai")] ?? null;
  const aiPrice = pricing?.sgp?.["OpticOdds AI"] ?? null;
  const headline = bookPrice ?? aiPrice;

  return (
    <div className="build">
      <section className="chat">
        <div className="feed">
          {feed.length === 0 && (
            <div className="empty">
              <p className="h">How does this one go?</p>
              <p className="s">Tell it like you'd tell a friend. The engine turns your story into a same-game parlay you can trim and rebuild.</p>
              {examples.map((e) => <button key={e} className="chip" onClick={() => send(e)}>"{e}"</button>)}
              <button className="chip" onClick={onBack} style={{ color: "var(--muted)" }}>← Different game</button>
            </div>
          )}
          {feed.map((m, i) => m.role === "user" ? (
            <div key={i} className={`u ${m.meta ? "meta" : ""}`}>{m.text}</div>
          ) : (
            <div key={i} className="e">
              {m.error ? <p className="err">{m.error}</p> : (<>
                <p style={{ margin: 0 }}>{m.summary}</p>
                <p className="m">{m.label === "rebuilt" ? "Rebuilt the slip" : "Built a slip"} with {m.count} leg{m.count === 1 ? "" : "s"}. Lock what you like, drop what you don't, then rebuild.</p>
                {m.note && <p className="n">{m.note}</p>}
              </>)}
            </div>
          ))}
          {loading && <div className="e" style={{ color: "var(--muted)" }}>Reading the story…</div>}
          <div ref={end} />
        </div>
        <div className="compose">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder={turns.length ? "Add to the story…" : "I think…"} disabled={loading} />
          <button className="primary" onClick={() => send(input)} disabled={loading || !input.trim()}>Build</button>
        </div>
      </section>

      <aside className="slip">
        <div className="hd">
          <span>Your slip · {pricing?.sportsbook || "book"} lines</span>
          {feed.length > 0 && <button onClick={onBack} style={{ color: "var(--muted)", fontSize: 12 }}>Start over</button>}
        </div>
        {turns.length > 0 && <p className="story">"{turns[0]}"</p>}
        <div className="legs">
          {loading && legs.length === 0 && [0, 1, 2, 3].map((i) => <div key={i} className="skel" />)}
          {!loading && legs.length === 0 && <p className="hint">Legs land here once you've told the story.</p>}
          {legs.map((leg) => (
            <div key={leg.id} className="leg" style={{ opacity: loading ? .5 : 1 }}>
              <div className="l">
                <div className="row"><div className="nm">{leg.label}</div><div className="px">{fmtAm(leg.price)}</div></div>
                <div className="why">{leg.why}</div>
              </div>
              <div className="acts">
                <button className={`ico ${leg.locked ? "on" : ""}`} title={leg.locked ? "Unlock" : "Keep on rebuild"} onClick={() => lock(leg.id)}>{leg.locked ? "✓" : "○"}</button>
                <button className="ico" title="Drop this leg" onClick={() => drop(leg.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
        <div className="tot">
          <div className="row">
            <div>
              <div className="k">{legs.length} leg{legs.length === 1 ? "" : "s"} · {headline != null ? "correlated SGP price" : dirty ? "reprice on rebuild" : "no SGP price"}</div>
              {pricing && <div className="naive">Straight multiply {fmtAm(pricing.naive)}{aiPrice != null && bookPrice != null ? ` · OpticOdds AI ${fmtAm(aiPrice)}` : ""}</div>}
              {pricing?.sgp_error && <div className="k" style={{ color: "var(--danger)" }}>{pricing.sgp_error}</div>}
            </div>
            <div className="big">{headline != null ? fmtAm(headline) : pricing ? fmtAm(pricing.naive) : "—"}</div>
          </div>
          <div className="btns">
            <button className={`rebuild ${dirty ? "on" : ""}`} onClick={rebuild} disabled={!dirty || loading}>{dirty ? `Rebuild (${rejected.length} dropped)` : "Rebuild"}</button>
            <button className="primary" disabled={!legs.length}>Add to betslip</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
