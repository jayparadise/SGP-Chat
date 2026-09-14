"use client";
import { useEffect, useRef, useState } from "react";

const SPORTS = [
  ["nfl", "NFL", "🏈"], ["ncaaf", "NCAAF", "🏈"], ["nba", "NBA", "🏀"], ["mlb", "MLB", "⚾"], ["nhl", "NHL", "🏒"], ["epl", "Premier League", "⚽"],
];

const EXAMPLES = {
  nfl: ["Home team wins big and the QB has a huge game", "Low-scoring slugfest decided on the ground", "Shootout, 5+ legs, at least 15.0"],
  ncaaf: ["Favorite covers easily and runs it 40 times", "Upset — the dog's QB has the game of his life"],
  nba: ["Star goes for 40 and they blow the doors off", "Grind-it-out game, under the total, home team squeaks by"],
  mlb: ["Ace dominates, 8+ Ks, offense chips in just enough", "Slugfest — bullpens get torched, over the total"],
  nhl: ["Goalie stands on his head, 2-1 win", "Track meet — over the total, top line feasts"],
  epl: ["Home side dominates possession and wins to nil", "Scrappy 1-1, lots of cards, few shots on target"],
};

const toDec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);
const dec = (a) => (a == null ? "—" : toDec(a).toFixed(2));
const decN = (d) => (d == null ? "—" : Number(d).toFixed(2));
const fmtTime = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

let seq = 0;
const id = () => ++seq;

export default function Page() {
  const [sport, setSport] = useState("nfl");
  const [game, setGame] = useState(null);
  const [thread, setThread] = useState([]);       // messages
  const [legs, setLegs] = useState([]);           // current slip (attached to the last card)
  const [rejected, setRejected] = useState([]);
  const [turns, setTurns] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [input, setInput] = useState("");
  const end = useRef(null);
  const repriceSeq = useRef(0);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread, loading, legs]);

  // Sport change → ask for a game, in the thread.
  useEffect(() => {
    setGame(null); setLegs([]); setRejected([]); setTurns([]); setPricing(null); setDirty(false);
    const label = SPORTS.find((s) => s[0] === sport)?.[1];
    const mid = id();
    setThread([{ id: mid, role: "bot", kind: "games", text: `Which ${label} game are we talking about?`, fixtures: null, err: "" }]);
    fetch(`/api/fixtures?sport=${sport}`).then((r) => r.json()).then((d) => {
      setThread((t) => t.map((m) => (m.id === mid ? { ...m, fixtures: d.fixtures || [], err: d.error || "" } : m)));
    }).catch((e) => setThread((t) => t.map((m) => (m.id === mid ? { ...m, fixtures: [], err: String(e) } : m))));
  }, [sport]);

  function pickGame(f) {
    setGame(f);
    setThread((t) => [...t,
      { id: id(), role: "you", text: `${f.away} at ${f.home}` },
      { id: id(), role: "bot", kind: "prompt", text: "How does it go? Tell it like you'd tell a friend. You can add rules too — \"at least 5 legs\", \"minimum 15.0\".", examples: EXAMPLES[sport] || [] },
    ]);
  }

  const lockedIds = legs.filter((l) => l.locked).map((l) => l.id);

  async function run(nextTurns, locked, rej, rebuilt) {
    setLoading(true); setDirty(false);
    const mid = id();
    setThread((t) => [...t, { id: mid, role: "bot", kind: "card", pending: true }]);
    try {
      const r = await fetch("/api/build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, fixture_id: game.id, turns: nextTurns, locked, rejected: rej }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setLegs(r.legs.map((l) => ({ ...l, gone: false })));
      setPricing(r.pricing);
      setThread((t) => t.map((m) => (m.id === mid ? {
        id: mid, role: "bot", kind: "card", pending: false, title: r.title, summary: r.summary, note: r.note,
        constraints: r.constraints, unmet: r.unmet, rebuilt, latest: true,
      } : { ...m, latest: false })));
    } catch (e) {
      setThread((t) => t.map((m) => (m.id === mid ? { id: mid, role: "bot", kind: "text", err: String(e.message || e) } : m)));
    } finally { setLoading(false); }
  }

  function send(text) {
    const t = text.trim(); if (!t || loading) return;
    setInput("");
    if (!game) return; // game must be picked via the cards
    const nextTurns = [...turns, t];
    setTurns(nextTurns);
    setThread((th) => [...th, { id: id(), role: "you", text: t }]);
    run(nextTurns, lockedIds, rejected, false);
  }

  async function reprice(ids) {
    const s = ++repriceSeq.current;
    try {
      const r = await fetch("/api/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sport, fixture_id: game.id, ids }) }).then((x) => x.json());
      if (s === repriceSeq.current && r.pricing) setPricing(r.pricing);
    } catch { /* keep naive */ }
  }
  function drop(legId) {
    const next = legs.map((l) => (l.id === legId ? { ...l, gone: true } : l));
    setLegs(next); setRejected((r) => [...r, legId]); setDirty(true);
    const live = next.filter((l) => !l.gone).map((l) => l.id);
    if (live.length >= 2) reprice(live);
  }
  function lock(legId) { setLegs((ls) => ls.map((l) => (l.id === legId ? { ...l, locked: !l.locked } : l))); }
  function rebuild() {
    setThread((t) => [...t, { id: id(), role: "you", meta: true, text: `Rebuild — keep ${lockedIds.length}, drop ${rejected.length}` }]);
    run(turns, lockedIds, rejected, true);
  }

  const live = legs.filter((l) => !l.gone);
  const naive = live.length ? live.reduce((p, l) => p * toDec(l.price), 1) : null;
  const sgpBook = pricing?.sgp ? Object.entries(pricing.sgp).find(([k, v]) => k.toLowerCase() !== "opticodds ai" && v != null) : null;
  const headline = sgpBook ? toDec(sgpBook[1]) : naive;

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><h1>SGP Chat</h1><span className="sub">DST · narrative bet builder</span></div>
        <nav className="sports">
          {SPORTS.map(([k, l, ic]) => (
            <button key={k} className={`sport ${k === sport ? "on" : ""}`} onClick={() => setSport(k)}><span className="ic">{ic}</span>{l}</button>
          ))}
        </nav>
      </header>

      <main className="thread">
        {thread.map((m) => {
          if (m.role === "you") return <div key={m.id} className={`you ${m.meta ? "meta" : ""}`}>{m.text}</div>;
          if (m.kind === "games") return (
            <div key={m.id} className="bot">
              <div className="who">SGP CHAT</div>
              <p>{m.text}</p>
              {m.err && <p className="err">Couldn't load games: {m.err}</p>}
              {m.fixtures == null && !m.err && <p className="dim">Loading…</p>}
              {m.fixtures?.length === 0 && <p className="dim">Nothing on the board in the next 36 hours.</p>}
              {m.fixtures?.length > 0 && !game && (
                <div className="games">
                  {m.fixtures.map((f) => (
                    <button key={f.id} className={`game ${f.is_live ? "live" : ""}`} onClick={() => pickGame(f)}>
                      <div className="t">{f.away} at {f.home}</div>
                      <div className="m">{f.is_live ? "Live now" : fmtTime(f.start_date)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
          if (m.kind === "prompt") return (
            <div key={m.id} className="bot">
              <div className="who">SGP CHAT</div>
              <p>{m.text}</p>
              {turns.length === 0 && <div className="chips">{m.examples.map((e) => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}</div>}
            </div>
          );
          if (m.kind === "text") return (
            <div key={m.id} className="bot"><div className="who">SGP CHAT</div><p className="err">{m.err}</p></div>
          );
          // card
          const isLatest = m.latest && !loading;
          return (
            <div key={m.id} className="bot">
              <div className="who">SGP CHAT</div>
              {m.pending ? (
                <>
                  <p className="dim">Reading the story…</p>
                  <div className="card">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" />)}</div>
                </>
              ) : (
                <>
                  <p>{m.summary}</p>
                  {m.latest ? (
                    <div className="card">
                      <div className="hd">
                        <div>
                          <div className="k">{live.length} legs · {game?.away} at {game?.home}</div>
                          <div className="t">{m.title || "Your slip"}</div>
                        </div>
                        <div className="px">
                          <div className="big">{decN(headline)}</div>
                          <div className="k2">{sgpBook ? `SGP · ${pricing.sportsbook}` : "straight multiply"}</div>
                        </div>
                      </div>
                      {legs.map((leg) => (
                        <div key={leg.id} className={`leg ${leg.gone ? "gone" : ""}`}>
                          <div className="l">
                            <div className="nm">{leg.label}</div>
                            <div className="why">{leg.why}</div>
                          </div>
                          <div className="px">{dec(leg.price)}</div>
                          {!leg.gone && isLatest && (
                            <div className="acts">
                              <button className={`ico ${leg.locked ? "on" : ""}`} title={leg.locked ? "Unlock" : "Keep on rebuild"} onClick={() => lock(leg.id)}>{leg.locked ? "✓" : "○"}</button>
                              <button className="ico" title="Drop this leg" onClick={() => drop(leg.id)}>×</button>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="ft">
                        <div>
                          {game?.start_date && <span>Starts {fmtTime(game.start_date)} · {pricing?.sportsbook || "book"} lines</span>}
                          {m.unmet?.length > 0 && <div className="warn">Couldn't fully hit your target: {m.unmet.join("; ")}</div>}
                        </div>
                        <div className="btns">
                          <button className={`rebuild ${dirty ? "on" : ""}`} onClick={rebuild} disabled={!dirty || loading}>{dirty ? `Rebuild (${rejected.length} dropped)` : "Rebuild"}</button>
                          <button className="primary" disabled={!live.length}>Add to betslip</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="dim">Earlier slip — superseded below.</p>
                  )}
                  {m.note && <p className="dim">{m.note}</p>}
                  {m.latest && !m.pending && (
                    <p className="dim">Lock what you like, drop what you don't, then rebuild — or keep talking to change the story.</p>
                  )}
                </>
              )}
            </div>
          );
        })}
        <div ref={end} />
      </main>

      <div className="composer">
        <div className="in">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder={!game ? "Pick a game above to start" : turns.length ? "Add to the story, or set a rule…" : "How does this one go?"} disabled={loading || !game} />
          <button className="send" onClick={() => send(input)} disabled={loading || !game || !input.trim()} aria-label="Send">↑</button>
        </div>
      </div>
    </div>
  );
}
