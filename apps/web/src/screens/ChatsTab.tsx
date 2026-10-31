import { useEffect, useRef, useState } from "react"
import { Avatar, ROLE_LABEL } from "../components/Avatar"
import type { MixerState } from "../useMixer"
import { MeetPanel, attendanceOf, bothOnsite, effective } from "./MatchesTab"

const first = (n: string) => n.split(" ")[0]

export function ChatsTab({
  mx,
  me,
  open,
  setOpen,
}: {
  mx: MixerState
  me: string
  open: string | null
  setOpen: (id: string | null) => void
}) {
  const connected = (mx.attendee?.matches ?? []).filter((m) => effective(m, mx.intros[m.introId], me).status === "connected")

  if (open && connected.some((x) => x.introId === open)) {
    return <Thread mx={mx} me={me} introId={open} onBack={() => setOpen(null)} />
  }

  return (
    <div className="page">
      <h1 className="page-title">Chats</h1>
      {connected.length === 0 ? (
        <div className="empty">
          <strong>No human chats yet</strong>
          <p>A private chat opens only after both people choose Connect.</p>
        </div>
      ) : (
        <div className="rows">
          {connected.map((m) => {
            const it = mx.intros[m.introId]
            const last = it?.chat[it.chat.length - 1]
            const ask = it?.meetNow?.status === "requested" && it.meetNow.requestedBy !== me
            return (
              <button key={m.introId} className="row-card" onClick={() => setOpen(m.introId)}>
                <Avatar id={m.other.id} role={m.other.role} avatar={m.other.avatar} size={48} />
                <span className="row-text">
                  <strong>{m.other.name}</strong>
                  <small>{ask ? `${first(m.other.name)} wants to meet now` : last ? `${last.from === me ? "You: " : ""}${last.text}` : "Here now · say hi"}</small>
                </span>
                {(ask || (last && last.from !== me)) && <span className="unread" />}
                <span className="chev">›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Thread({ mx, me, introId, onBack }: { mx: MixerState; me: string; introId: string; onBack: () => void }) {
  const it = mx.intros[introId]
  const m = mx.attendee?.matches.find((x) => x.introId === introId)
  const [text, setText] = useState("")
  const [pending, setPending] = useState<{ id: string; text: string; failed: boolean }[]>([])
  const [showMeet, setShowMeet] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const lines = it?.chat ?? []
  const opener = (it?.opener ?? m?.opener ?? "").replace(/^“|”$/g, "")

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [lines.length, showMeet, pending.length])

  // Requested/accepted opens the panel; declined/expired returns to chat with a short notice.
  const mnStatus = it?.meetNow?.status
  const mnKey = it?.meetNow ? `${it.meetNow.at}:${mnStatus}` : ""
  const [dismissed, setDismissed] = useState<string | null>(null)
  useEffect(() => {
    if (mnStatus === "requested" || mnStatus === "accepted") setShowMeet(true)
    else if (mnStatus === "declined" || mnStatus === "expired") setShowMeet(false)
  }, [mnKey, mnStatus])

  async function send(t: string, retryId?: string) {
    t = t.trim()
    if (!t || !mx.backend) return
    const id = retryId ?? `p-${Date.now()}`
    setText("")
    setPending((cur) => (retryId ? cur.map((p) => (p.id === id ? { ...p, failed: false } : p)) : [...cur, { id, text: t, failed: false }]))
    try {
      mx.setIntro(await mx.backend.chat(introId, me, t))
      setPending((cur) => cur.filter((p) => p.id !== id))
    } catch (err) {
      console.error(err)
      setPending((cur) => cur.map((p) => (p.id === id ? { ...p, failed: true } : p)))
    }
  }

  if (!m) return null
  const canMeet = bothOnsite(m, it, me, mx)
  const theirAttendance = attendanceOf(m.other.id, it, mx)
  const mn = it?.meetNow
  const declinedByMe = mn?.status === "declined" && mn.respondedBy === me
  const notice =
    mn && (mn.status === "declined" || mn.status === "expired") && dismissed !== mnKey
      ? mn.status === "expired"
        ? "Meet now request expired. Keep chatting, or send a new one."
        : declinedByMe
          ? "You declined Meet now. Keep chatting here."
          : `${first(m.other.name)} can't meet right now. Keep chatting, or try again later.`
      : null
  return (
    <div className="page thread">
      <div className="topline">
        <button className="back" onClick={onBack} aria-label="Back to chats">
          ←
        </button>
        <Avatar id={m.other.id} role={m.other.role} avatar={m.other.avatar} size={34} />
        <span className="topline-who">
          <strong>{m.other.name}</strong>
          <small>
            {theirAttendance === "onsite" ? "Here now" : "Agent only"} · {ROLE_LABEL[m.other.role]}
          </small>
        </span>
        <button className={`pill-btn ${mn?.status === "accepted" ? "cyan" : canMeet ? "pink" : "yellow"}`} onClick={() => setShowMeet((x) => !x)}>
          {canMeet ? "Meet now" : "Meet"}
        </button>
      </div>
      <div className="presence-line">
        {canMeet ? "You're both at Haunted Hacks · Meet now is available" : "One of you joined agent-only · chat stays open"}
      </div>

      {notice && (
        <div className="banner info meet-notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setDismissed(mnKey)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {showMeet && <MeetPanel m={m} it={it} me={me} mx={mx} />}

      {!it && <p className="note">Loading your chat…</p>}

      {lines.length === 0 && opener && (
        <section className="opener-box">
          <h4>Suggested opener</h4>
          <p>“{opener}”</p>
          <button className="text-btn" onClick={() => setText(opener)}>
            Use opener
          </button>
        </section>
      )}

      <div className="chat-lines">
        {lines.map((l) => (
          <div key={l.id} className={`chat-msg ${l.from === me ? "self" : ""}`}>
            {l.from !== me && <Avatar id={m.other.id} role={m.other.role} avatar={m.other.avatar} size={28} />}
            <p>{l.text}</p>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.id} className={`chat-msg self ${p.failed ? "failed" : "sending"}`}>
            <p>{p.text}</p>
            <small className="send-state">
              {p.failed ? (
                <>
                  Not sent ·{" "}
                  <button className="inline-link" onClick={() => send(p.text, p.id)}>
                    Retry
                  </button>
                </>
              ) : (
                "Sending…"
              )}
            </small>
          </div>
        ))}
        <div ref={end} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${first(m.other.name)}`} maxLength={500} />
        <button disabled={!text.trim()} aria-label="Send">
          ↑
        </button>
      </form>
    </div>
  )
}
