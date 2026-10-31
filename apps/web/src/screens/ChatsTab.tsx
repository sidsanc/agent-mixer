import { useEffect, useRef, useState } from "react"
import { Avatar, ROLE_LABEL } from "../components/Avatar"
import type { MixerState } from "../useMixer"
import { MeetPanel, effective } from "./MatchesTab"

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
            const ask = it?.meetNow && !it.meetNow.accepted && it.meetNow.requestedBy !== me
            return (
              <button key={m.introId} className="row-card" onClick={() => setOpen(m.introId)}>
                <Avatar id={m.other.id} role={m.other.role} size={48} />
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
  const [sending, setSending] = useState(false)
  const [showMeet, setShowMeet] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const lines = it?.chat ?? []
  const opener = (it?.opener ?? m?.opener ?? "").replace(/^“|”$/g, "")

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [lines.length, showMeet])

  // A meet-now request from them opens the panel.
  useEffect(() => {
    if (it?.meetNow) setShowMeet(true)
  }, [it?.meetNow])

  async function send(t: string) {
    t = t.trim()
    if (!t || !mx.backend) return
    setSending(true)
    setText("")
    try {
      mx.setIntro(await mx.backend.chat(introId, me, t))
    } catch (err) {
      console.error(err)
      setText(t)
    } finally {
      setSending(false)
    }
  }

  if (!m) return null
  return (
    <div className="page thread">
      <div className="topline">
        <button className="back" onClick={onBack} aria-label="Back to chats">
          ←
        </button>
        <Avatar id={m.other.id} role={m.other.role} size={34} />
        <span className="topline-who">
          <strong>{m.other.name}</strong>
          <small>Here now · {ROLE_LABEL[m.other.role]}</small>
        </span>
        <button className={`pill-btn ${it?.meetNow?.accepted ? "cyan" : "pink"}`} onClick={() => setShowMeet((x) => !x)}>
          Meet now
        </button>
      </div>
      <div className="presence-line">You both chose Connect. Your human chat is now private.</div>

      {showMeet && <MeetPanel m={m} it={it} me={me} mx={mx} />}

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
            {l.from !== me && <Avatar id={m.other.id} role={m.other.role} size={28} />}
            <p>{l.text}</p>
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
        <button disabled={!text.trim() || sending} aria-label="Send">
          ↑
        </button>
      </form>
    </div>
  )
}
