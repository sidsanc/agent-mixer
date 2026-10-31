import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { MatchSummary } from "@agent-mixer/shared"
import { myId } from "../backend"
import { useMixer } from "../useMixer"
import { Avatar } from "../components/Avatar"
import { Confetti } from "../components/Confetti"
import { AgentTab } from "./AgentTab"
import { MatchesTab, bothOnsite, effective, type Phase } from "./MatchesTab"
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
  const [toast, setToast] = useState<{ kind: "match" | "request" | "connected"; m: MatchSummary } | null>(null)
  const [celebrate, setCelebrate] = useState<MatchSummary | null>(null)
  const [meetPing, setMeetPing] = useState<string | null>(null)
  // Only call it "reconnecting" after the stream has been down for a moment.
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    if (mx.connected || mx.backend?.mode !== "live") return setOffline(false)
    const t = setTimeout(() => setOffline(true), 1500)
    return () => clearTimeout(t)
  }, [mx.connected, mx.backend])

  useEffect(() => {
    if (!me) nav("/", { replace: true })
  }, [me, nav])

  // A mock id against the live server (or an unknown id): sign up again.
  useEffect(() => {
    if (!me || !mx.backend) return
    if ((mx.backend.mode === "live" && me.startsWith("mock-")) || mx.notFound) {
      myId.clear()
      nav(mx.notFound ? "/?expired=1" : "/", { replace: true })
    }
  }, [me, mx.backend, mx.notFound, nav])

  // Chats stay badged until opened: introId -> chat length last seen (per attendee, survives reload).
  const seenKey = `am.chatSeen.${me}`
  const [chatSeen, setChatSeen] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(seenKey) ?? "{}")
    } catch {
      return {}
    }
  })
  const markSeen = (id: string, n: number) =>
    setChatSeen((cur) => {
      if (cur[id] === n) return cur
      const next = { ...cur, [id]: n }
      try {
        localStorage.setItem(seenKey, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  const openThreadLen = chatOpen ? mx.intros[chatOpen]?.chat.length ?? 0 : 0
  useEffect(() => {
    if (tab === "chats" && chatOpen && mx.intros[chatOpen]) markSeen(chatOpen, openThreadLen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, chatOpen, openThreadLen])

  // New matches, incoming connect requests, fresh mutual connects, meet-now requests.
  const seen = useRef<Map<string, Phase> | null>(null)
  const seenMeet = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!mx.attendee || !me) return
    const prev = seen.current
    const next = new Map<string, Phase>()
    for (const m of mx.attendee.matches) {
      const ph = effective(m, mx.intros[m.introId], me).phase
      next.set(m.introId, ph)
      if (prev) {
        const was = prev.get(m.introId)
        if (ph === "connected" && was !== "connected") {
          setCelebrate(m)
          setToast({ kind: "connected", m })
          try {
            navigator.vibrate?.(200)
          } catch {
            /* unsupported */
          }
        } else if (ph === "incoming" && was !== "incoming") {
          setToast({ kind: "request", m })
          try {
            navigator.vibrate?.([80, 60, 80])
          } catch {
            /* unsupported */
          }
        } else if (!was && ph === "new") setToast({ kind: "match", m })
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
  const phases = matches.map((m) => ({ m, ph: effective(m, mx.intros[m.introId], me).phase }))
  const newCount = phases.filter((x) => x.ph === "new" || x.ph === "incoming").length
  const chatCount = phases.filter(({ m, ph }) => {
    if (ph !== "connected") return false
    const it = mx.intros[m.introId]
    const n = it?.chat.length ?? 0
    const seenN = chatSeen[m.introId]
    if (seenN === undefined) return true // never opened
    const last = it?.chat[n - 1]
    return n > seenN && !!last && last.from !== me
  }).length
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
        {!mx.attendee ? (
          <div className="page state-page" role="status">
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
            <strong>Loading your event…</strong>
            <p>Restoring your agent and conversations.</p>
          </div>
        ) : null}
        {mx.attendee && tab === "events" && <EventsTab mx={mx} me={me} onEnter={() => go("agents")} />}
        {mx.attendee && tab === "agents" && <AgentTab mx={mx} me={me} onOpenMatches={() => go("matches")} />}
        {mx.attendee && tab === "matches" && <MatchesTab mx={mx} me={me} open={matchOpen} setOpen={setMatchOpen} onChat={openChat} />}
        {mx.attendee && tab === "chats" && <ChatsTab mx={mx} me={me} open={chatOpen} setOpen={setChatOpen} />}
      </main>

      <nav className="bottom-nav">
        <NavBtn on={tab === "events"} onClick={() => go("events")} label="Events" glyph="◎" />
        <NavBtn on={tab === "agents"} onClick={() => go("agents")} label="Agents" glyph="◉" />
        <NavBtn on={tab === "matches"} onClick={() => go("matches")} label="Matches" glyph="◆" count={newCount} />
        <NavBtn on={tab === "chats"} onClick={() => go("chats")} label="Chats" glyph="●" count={chatCount} />
      </nav>

      {mx.backend?.mode === "mock" && <div className="demo-tag">demo data</div>}
      {offline && (
        <div className="net-banner" role="status">
          Reconnecting… your agent keeps working; updates resume in a moment.
        </div>
      )}

      {toast && (
        <button
          className={`toast ${toast.kind === "match" ? "" : `t-${toast.kind}`}`}
          onClick={() => {
            const id = toast.m.introId
            setToast(null)
            if (toast.kind === "connected") {
              setCelebrate(null)
              openChat(id)
            } else openMatch(id)
          }}
        >
          <Avatar id={toast.m.other.id} role={toast.m.other.role} avatar={toast.m.other.avatar} size={38} />
          <span>
            <strong>
              {toast.kind === "connected"
                ? `You and ${first(toast.m.other.name)} are connected — say hi`
                : toast.kind === "request"
                  ? `${first(toast.m.other.name)} wants to connect`
                  : `New match · ${toast.m.other.name}`}
            </strong>
            <small>{toast.kind === "connected" ? "Your private chat is open." : toast.m.why}</small>
          </span>
          <b>{toast.kind === "connected" ? "Chat ›" : toast.kind === "request" ? "Accept ›" : "Review ›"}</b>
        </button>
      )}

      {pingMatch && !celebrate && !toast && (
        <div className="toast meet">
          <Avatar id={pingMatch.other.id} role={pingMatch.other.role} avatar={pingMatch.other.avatar} size={38} />
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
              <Avatar id={celebrate.other.id} role={celebrate.other.role} avatar={celebrate.other.avatar} size={88} />
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
