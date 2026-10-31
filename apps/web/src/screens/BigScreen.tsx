import { useEffect, useMemo, useRef, useState } from "react"
import QRCode from "qrcode"
import type { EventView, PublicProfile } from "@agent-mixer/shared"
import { useMixer } from "../useMixer"
import { ROLE_COLOR } from "../components/Avatar"
import { Confetti } from "../components/Confetti"
import { VenueWorld, type WorldAgent, type WorldBubble } from "../components/VenueWorld"

const firstName = (p?: PublicProfile) => (p ? p.name.split(" ")[0] : "Someone")

export function BigScreen() {
  const mx = useMixer(null)
  const ev = mx.event

  const world = useMemo(() => {
    const roster = ev?.roster ?? []
    const byId = new Map(roster.map((r) => [r.id, r]))
    const agents: WorldAgent[] = roster.slice(0, 30).map((r) => ({ id: r.id, name: firstName(r), color: ROLE_COLOR[r.role], avatar: r.avatar }))
    const shown = new Set(agents.map((a) => a.id))
    const pairs: [string, string][] = (ev?.active ?? []).filter((a) => shown.has(a.a) && shown.has(a.b)).map((a) => [a.a, a.b])
    const lastBy = new Map<string, EventView["feed"][number]>()
    for (const f of ev?.feed ?? []) lastBy.set(f.conversationId, f)
    const bubbles: WorldBubble[] = []
    for (const a of ev?.active ?? []) {
      const l = lastBy.get(a.id)
      if (!l || !shown.has(l.from)) continue
      bubbles.push({ key: l.id, speaker: l.from, label: `${firstName(byId.get(l.from))}'s agent`, text: l.text })
    }
    return { agents, pairs, bubbles }
  }, [ev])

  return (
    <div className="screen">
      <div className="screen-world">
        <VenueWorld variant="screen" agents={world.agents} pairs={world.pairs} bubbles={world.bubbles} />
        <header className="screen-head">
          <div>
            <h1>Haunted Hacks</h1>
            <p>Agent World · your agent works the room</p>
          </div>
          <div className="head-stats">
            <Stat label="guests" value={ev?.roster.length ?? 0} />
            <Stat label="talking now" value={ev?.active.length ?? 0} />
          </div>
        </header>
        {(ev?.roster.length ?? 0) === 0 && <p className="party-empty">Scan the code to send your agent in.</p>}
        <MatchBurst ev={ev} />
      </div>
      <aside className="side">
        <MatchCounter matches={ev?.matchCount ?? 0} connected={ev?.connectedCount ?? 0} />
        <Feed ev={ev} />
        <JoinQR />
      </aside>
      {mx.backend?.mode === "mock" && <div className="mock-tag">demo data</div>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong key={value} className="pop">
        {value}
      </strong>
      <span>{label}</span>
    </div>
  )
}

/** When the match count goes up, name the pair that just left their conversation. */
function MatchBurst({ ev }: { ev: EventView | null }) {
  const prev = useRef<{ active: EventView["active"]; matchCount: number } | null>(null)
  const [burst, setBurst] = useState<{ key: number; names: string } | null>(null)
  useEffect(() => {
    if (!ev) return
    const p = prev.current
    if (p && ev.matchCount > p.matchCount) {
      const now = new Set(ev.active.map((a) => a.id))
      const gone = p.active.filter((a) => !now.has(a.id))
      const pair = gone[gone.length - 1]
      const names = pair
        ? `${firstName(ev.roster.find((r) => r.id === pair.a))} + ${firstName(ev.roster.find((r) => r.id === pair.b))}`
        : "Two agents"
      setBurst({ key: Date.now(), names })
    }
    prev.current = { active: ev.active, matchCount: ev.matchCount }
  }, [ev])
  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => setBurst(null), 3800)
    return () => clearTimeout(t)
  }, [burst])
  if (!burst) return null
  return (
    <div key={burst.key} className="match-burst">
      <Confetti count={60} />
      <div className="burst-card">
        <span>New match</span>
        <strong>{burst.names}</strong>
      </div>
    </div>
  )
}

function MatchCounter({ matches, connected }: { matches: number; connected: number }) {
  const prev = useRef(connected)
  const [party, setParty] = useState(0)
  useEffect(() => {
    if (connected > prev.current) setParty(Date.now())
    prev.current = connected
  }, [connected])
  useEffect(() => {
    if (!party) return
    const t = setTimeout(() => setParty(0), 4500)
    return () => clearTimeout(t)
  }, [party])
  return (
    <div className={`counter ${party ? "party-on" : ""}`}>
      {party ? <Confetti key={party} count={80} /> : null}
      <div className="counter-row">
        <div>
          <strong key={matches} className="pop">
            {matches}
          </strong>
          <span>matches</span>
        </div>
        <div className="counter-connected">
          <strong key={connected} className="pop">
            {connected}
          </strong>
          <span>both said Connect</span>
        </div>
      </div>
      {party ? <p className="counter-shout">Two humans just connected!</p> : null}
    </div>
  )
}

function Feed({ ev }: { ev: EventView | null }) {
  const items = [...(ev?.feed ?? [])].reverse().slice(0, 8)
  const who = (id: string) => ev?.roster.find((r) => r.id === id)
  return (
    <div className="feed">
      <h3>
        <i className="live-dot" /> Live from the agents
      </h3>
      <ol>
        {items.length === 0 && <li className="muted">Waiting for the first hello…</li>}
        {items.map((f) => {
          const a = who(f.from)
          const b = who(f.to)
          return (
            <li key={f.id}>
              <span className="feed-who">
                <b style={{ color: a ? ROLE_COLOR[a.role] : undefined }}>{firstName(a)}'s agent</b>
                <em> to </em>
                <b style={{ color: b ? ROLE_COLOR[b.role] : undefined }}>{firstName(b)}'s</b>
              </span>
              <p>{f.text}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function JoinQR() {
  const url = `${window.location.origin}/`
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 400, color: { dark: "#210d2a", light: "#fff7df" } })
      .then(setSrc)
      .catch(() => setSrc(null))
  }, [url])
  return (
    <div className="qr">
      {src && <img src={src} alt={`QR code to join at ${url}`} />}
      <div>
        <strong>Send your agent in</strong>
        <span>Scan, type one sentence, done.</span>
        <code>{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</code>
      </div>
    </div>
  )
}
