import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { MatchSummary } from "@agent-mixer/shared"
import { myId } from "../backend"
import { useMixer } from "../useMixer"
import { Avatar } from "../components/Avatar"
import { Confetti } from "../components/Confetti"
import { AgentTab } from "./AgentTab"
import { MatchesTab, bothOnsite, effective } from "./MatchesTab"
import { ChatsTab } from "./ChatsTab"
import { EventsTab } from "./EventsTab"

type Tab = "events" | "agents" | "matches" | "chats"
const first = (n: string) => n.split(" ")[0]

export function Me() {
  const nav = useNavigate()
  const me = myId.get()
  const mx = useMixer(me)
  const [tab, setTab] = useState<Tab>("agents")
  const [matchOpen, setMatchOpen] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState<string | null>(null)
  const [toast, setToast] = useState<MatchSummary | null>(null)
  const [celebrate, setCelebrate] = useState<MatchSummary | null>(null)
  const [meetPing, setMeetPing] = useState<string | null>(null)

  useEffect(() => {
    if (!me) nav("/", { replace: true })
  }, [me, nav])

  // A mock id against the live server (or an unknown id): sign up again.
  useEffect(() => {
    if (!me || !mx.backend) return
    if ((mx.backend.mode === "live" && me.startsWith("mock-")) || mx.notFound) {
      myId.clear()
      nav("/", { replace: true })
    }
  }, [me, mx.backend, mx.notFound, nav])

  // New matches, fresh mutual connects, meet-now requests.
  const seen = useRef<Map<string, string> | null>(null)
  const seenMeet = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!mx.attendee || !me) return
    const prev = seen.current
    const next = new Map<string, string>()
    for (const m of mx.attendee.matches) {
      const st = effective(m, mx.intros[m.introId], me).status
      next.set(m.introId, st)
      if (prev) {
        if (!prev.has(m.introId) && st === "pending") setToast(m)
        else if (prev.has(m.introId) && prev.get(m.introId) !== "connected" && st === "connected") {
          setToast(null)
          setCelebrate(m)
        }
      }
      const mn = mx.intros[m.introId]?.meetNow
      if (mn && (mn.status ?? (mn.accepted ? "accepted" : "requested")) === "requested" && mn.requestedBy !== me && !seenMeet.current.has(`${m.introId}:${mn.at}`)) {
        seenMeet.current.add(`${m.introId}:${mn.at}`)
        setMeetPing(m.introId)
      }
    }
    seen.current = next
  }, [mx.attendee, mx.intros, me])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(t)
  }, [toast])

  if (!me) return null
  const matches = mx.attendee?.matches ?? []
  const newCount = matches.filter((m) => {
    const e = effective(m, mx.intros[m.introId], me)
    return e.status === "pending" && !e.myChoice
  }).length
  const chatCount = matches.filter((m) => effective(m, mx.intros[m.introId], me).status === "connected").length
  const pingMatch = meetPing ? matches.find((m) => m.introId === meetPing && mx.intros[m.introId]?.meetNow?.status === "requested") : null
  const celebrateCanMeet = celebrate ? bothOnsite(celebrate, mx.intros[celebrate.introId], me, mx) : false

  const go = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }
  const openMatch = (id: string) => {
    setMatchOpen(id)
    go("matches")
  }
  const openChat = (id: string) => {
    setChatOpen(id)
    go("chats")
  }

  return (
    <div className={`app tab-${tab}`}>
      <main className="app-main">
        {tab === "events" && <EventsTab mx={mx} me={me} onEnter={() => go("agents")} />}
        {tab === "agents" && <AgentTab mx={mx} me={me} onOpenMatches={() => go("matches")} />}
        {tab === "matches" && <MatchesTab mx={mx} me={me} open={matchOpen} setOpen={setMatchOpen} onChat={openChat} />}
        {tab === "chats" && <ChatsTab mx={mx} me={me} open={chatOpen} setOpen={setChatOpen} />}
      </main>

      <nav className="bottom-nav">
        <NavBtn on={tab === "events"} onClick={() => go("events")} label="Events" glyph="◎" />
        <NavBtn on={tab === "agents"} onClick={() => go("agents")} label="Agents" glyph="◉" />
        <NavBtn on={tab === "matches"} onClick={() => go("matches")} label="Matches" glyph="◆" count={newCount} />
        <NavBtn on={tab === "chats"} onClick={() => go("chats")} label="Chats" glyph="●" count={chatCount} />
      </nav>

      {mx.backend?.mode === "mock" && <div className="demo-tag">demo data</div>}
      {mx.backend?.mode === "live" && !mx.connected && <div className="demo-tag warn">reconnecting…</div>}

      {toast && (
        <button
          className="toast"
          onClick={() => {
            setToast(null)
            openMatch(toast.introId)
          }}
        >
          <Avatar id={toast.other.id} role={toast.other.role} size={38} />
          <span>
            <strong>New match · {toast.other.name}</strong>
            <small>{toast.why}</small>
          </span>
          <b>Review ›</b>
        </button>
      )}

      {pingMatch && !celebrate && !toast && (
        <div className="toast meet">
          <Avatar id={pingMatch.other.id} role={pingMatch.other.role} size={38} />
          <span>
            <strong>{first(pingMatch.other.name)} wants to meet now</strong>
            <small>Accept or decline in your chat.</small>
          </span>
          <button
            className="pill-btn cyan"
            onClick={() => {
              setMeetPing(null)
              openChat(pingMatch.introId)
            }}
          >
            Review
          </button>
        </div>
      )}

      {celebrate && (
        <div className="celebrate" role="dialog" aria-label="You both chose Connect">
          <Confetti />
          <div className="celebrate-inner">
            <div className="pair-faces big">
              <Avatar id={me} role={mx.attendee?.profile?.role ?? "other"} size={88} agent />
              <span className="spark">✦</span>
              <Avatar id={celebrate.other.id} role={celebrate.other.role} size={88} />
            </div>
            <h1 className="celebrate-title">It's a match</h1>
            <p className="celebrate-sub">
              You and {first(celebrate.other.name)} both chose Connect. Your private chat is open.
            </p>
            <div className="opener-box">
              <h4>Start with this</h4>
              <p>“{(mx.intros[celebrate.introId]?.opener ?? celebrate.opener).replace(/^“|”$/g, "")}”</p>
            </div>
            {celebrateCanMeet && (
              <button
                className="cta pink"
                onClick={async () => {
                  const id = celebrate.introId
                  setCelebrate(null)
                  openChat(id)
                  if (mx.backend) mx.backend.meet(id, me, "request").then(mx.setIntro, (e) => console.error(e))
                }}
              >
                Meet now
              </button>
            )}
            <button
              className="cta ghost"
              onClick={() => {
                const id = celebrate.introId
                setCelebrate(null)
                openChat(id)
              }}
            >
              Open chat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NavBtn({ on, onClick, label, glyph, count = 0 }: { on: boolean; onClick: () => void; label: string; glyph: string; count?: number }) {
  return (
    <button className={on ? "on" : ""} onClick={onClick} aria-current={on ? "page" : undefined}>
      <span className="nav-glyph">
        {glyph}
        {count > 0 && <b>{count}</b>}
      </span>
      {label}
    </button>
  )
}
