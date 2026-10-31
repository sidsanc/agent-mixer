import { useEffect, useMemo, useRef, useState } from "react"
import type { Conversation, PublicProfile } from "@agent-mixer/shared"
import { Avatar, ROLE_COLOR, ROLE_LABEL } from "../components/Avatar"
import { Typewriter } from "../components/Typewriter"
import { VenueWorld, type WorldAgent, type WorldBubble } from "../components/VenueWorld"
import type { MixerState } from "../useMixer"

const first = (n: string) => n.split(" ")[0]

const STATUS: Record<Conversation["status"], string> = {
  active: "live",
  ended: "no fit",
  matched: "match",
  stopped: "ended",
}

function fallbackProfile(id: string): PublicProfile {
  return { id, name: id, agentName: "Their agent", role: "other", bio: "", shareableGoal: "" }
}

/** Agent World: my one avatar walks to the newest conversation; others roam with bubbles. */
export function AgentTab({ mx, me, onOpenMatches }: { mx: MixerState; me: string; onOpenMatches: () => void }) {
  const convs = mx.attendee?.conversations ?? []
  const active = convs.filter((c) => c.status === "active")
  const profile = mx.attendee?.profile
  const agentName = profile?.agentName ?? "Your agent"
  const [logsOpen, setLogsOpen] = useState(false)
  const [logTab, setLogTab] = useState<string | null>(null)
  const other = (c: Conversation) => mx.profileOf(c.a === me ? c.b : c.a) ?? fallbackProfile(c.a === me ? c.b : c.a)

  // Newest active conversation is the one my avatar walks to.
  const focusConv = useMemo(() => [...active].sort((x, y) => y.startedAt - x.startedAt)[0] ?? null, [active])
  const focusId = focusConv ? (focusConv.a === me ? focusConv.b : focusConv.a) : null

  const world = useMemo(() => {
    const agents: WorldAgent[] = [{ id: me, name: first(agentName.replace(/'s agent$/, "")), color: "#72eee9", isMe: true }]
    const partners = new Set(active.map((c) => (c.a === me ? c.b : c.a)))
    for (const id of partners) {
      const p = mx.profileOf(id)
      agents.push({ id, name: p ? first(p.name) : "Guest", color: p ? ROLE_COLOR[p.role] : "#fff" })
    }
    // A few other guests roaming, so the venue feels full.
    for (const r of mx.event?.roster ?? []) {
      if (agents.length >= 7) break
      if (r.id === me || partners.has(r.id)) continue
      agents.push({ id: r.id, name: first(r.name), color: ROLE_COLOR[r.role] })
    }
    const bubbles: WorldBubble[] = []
    for (const c of active) {
      const o = c.a === me ? c.b : c.a
      const isFocus = focusConv?.id === c.id
      const lines = isFocus ? c.lines : c.lines.filter((l) => l.from === o)
      const l = lines[lines.length - 1]
      if (!l) continue
      const p = mx.profileOf(o)
      bubbles.push({ key: l.id, speaker: l.from, label: l.from === me ? agentName : `${p ? first(p.name) : "Their"}'s agent`, text: l.text })
    }
    return { agents, bubbles }
  }, [me, agentName, active, mx, focusConv])

  const matchesCount = mx.attendee?.matches.length ?? 0
  const focusP = focusConv ? other(focusConv) : null
  const title = focusP ? `${agentName} is talking with ${first(focusP.name)}` : `${agentName} is working the room`
  const sub = focusP
    ? active.length > 1
      ? `${active.length - 1} other ${active.length === 2 ? "chat continues" : "chats continue"} · ${matchesCount} ${matchesCount === 1 ? "match" : "matches"}`
      : `Live conversation · ${matchesCount} ${matchesCount === 1 ? "match" : "matches"} so far`
    : "Looking for the next agent to talk to"

  const openLogs = (id?: string) => {
    setLogTab(id ?? focusConv?.id ?? convs[0]?.id ?? null)
    setLogsOpen(true)
  }

  return (
    <div className="world">
      <VenueWorld variant="phone" agents={world.agents} pairs={[]} focus={focusId} bubbles={world.bubbles} />
      <div className="world-hud">
        <div className="world-top">
          <div className="brand-block">
            <strong>Haunted Hacks</strong>
            <span>Agent World</span>
          </div>
          <button className="pill-btn yellow" onClick={() => openLogs()}>
            Chat logs · {convs.length}
          </button>
        </div>

        {active.length > 1 && (
          <div className="mini-cards">
            {active
              .filter((c) => c.id !== focusConv?.id)
              .map((c) => {
                const p = other(c)
                const l = c.lines[c.lines.length - 1]
                return (
                  <button key={c.id} className="mini-card" onClick={() => openLogs(c.id)}>
                    <Avatar id={p.id} role={p.role} size={30} />
                    <span>
                      <strong>{first(p.name)}</strong>
                      <small>{l ? l.text : "Saying hello…"}</small>
                    </span>
                  </button>
                )
              })}
          </div>
        )}

        <div className="world-status">
          <div>
            <strong>{title}</strong>
            <span>{sub}</span>
          </div>
          {matchesCount > 0 ? (
            <button className="pill-btn cyan" onClick={onOpenMatches}>
              Matches
            </button>
          ) : (
            <button className="pill-btn cyan" onClick={() => openLogs()}>
              Logs
            </button>
          )}
        </div>
      </div>

      <button className={`scrim ${logsOpen ? "on" : ""}`} aria-label="Close chat logs" onClick={() => setLogsOpen(false)} />
      <aside className={`logs-sheet ${logsOpen ? "on" : ""}`} aria-hidden={!logsOpen}>
        <div className="grab" />
        <div className="sheet-head">
          <div>
            <small>All conversations</small>
            <h2>Chat logs</h2>
          </div>
          <button className="close" onClick={() => setLogsOpen(false)} aria-label="Close chat logs">
            ×
          </button>
        </div>
        {convs.length === 0 ? (
          <p className="sheet-empty">No conversations yet. {agentName} is walking in.</p>
        ) : (
          <>
            <div className="log-tabs">
              {convs.slice(0, 8).map((c) => (
                <button key={c.id} className={`${logTab === c.id ? "on" : ""} st-${c.status}`} onClick={() => setLogTab(c.id)}>
                  {first(other(c).name)} · {STATUS[c.status]}
                </button>
              ))}
            </div>
            {convs
              .filter((c) => c.id === logTab)
              .map((c) => (
                <LogPanel key={c.id} c={c} me={me} other={other(c)} mx={mx} agentName={agentName} onOpenMatches={onOpenMatches} />
              ))}
          </>
        )}
      </aside>
    </div>
  )
}

function LogPanel({
  c,
  me,
  other,
  mx,
  agentName,
  onOpenMatches,
}: {
  c: Conversation
  me: string
  other: PublicProfile
  mx: MixerState
  agentName: string
  onOpenMatches: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [ending, setEnding] = useState(false)
  const active = c.status === "active"
  const last = c.lines[c.lines.length - 1]
  const nextSpeaker = last ? (last.from === c.a ? c.b : c.a) : c.a

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [c.lines.length])

  async function end() {
    if (!mx.backend) return
    setEnding(true)
    try {
      await mx.backend.endConversation(c.id, me)
      mx.refresh()
    } catch (e) {
      console.error(e)
      setEnding(false)
    }
  }

  return (
    <>
      <div className="panel" ref={scroller}>
        <div className="profile-line">
          <Avatar id={other.id} role={other.role} size={44} />
          <div>
            <strong>
              {other.name} <i className={`dot st-${c.status}`} />
            </strong>
            <span>
              {ROLE_LABEL[other.role]}
              {other.shareableGoal ? ` · ${other.shareableGoal}` : ""}
            </span>
          </div>
        </div>
        <div className="log-thread">
          {c.lines.map((l) => {
            const mine = l.from === me
            return (
              <div key={l.id} className={`turn ${mine ? "me" : ""}`}>
                {!mine && <Avatar id={other.id} role={other.role} size={30} />}
                <div className="msg">
                  <b>{mine ? agentName : other.agentName}</b>
                  {l === last && active ? <Typewriter text={l.text} at={l.at} /> : l.text}
                </div>
              </div>
            )
          })}
          {active && (
            <div className={`turn ${nextSpeaker === me ? "me" : ""}`}>
              {nextSpeaker !== me && <Avatar id={other.id} role={other.role} size={30} />}
              <div className="msg typing" aria-label="typing">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          {c.status === "matched" && <p className="log-note">Both agents saw a fit. Check Matches.</p>}
          {c.status === "ended" && <p className="log-note">The agents agreed this one is not a fit.</p>}
          {c.status === "stopped" && <p className="log-note">You ended this conversation.</p>}
        </div>
      </div>
      {active ? (
        <button className="danger-btn" onClick={end} disabled={ending}>
          {ending ? "Ending…" : "End this conversation"}
        </button>
      ) : c.status === "matched" ? (
        <button className="cta cyan" onClick={onOpenMatches}>
          Review match
        </button>
      ) : null}
    </>
  )
}
