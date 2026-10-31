import { useState } from "react"
import type { Choice, IntroState, MatchSummary } from "@agent-mixer/shared"
import { Avatar, ROLE_LABEL } from "../components/Avatar"
import type { MixerState } from "../useMixer"

const first = (n: string) => n.split(" ")[0]

export function effective(m: MatchSummary, it: IntroState | undefined, me: string) {
  return {
    status: it?.status ?? m.status,
    myChoice: (it?.choices?.[me] ?? m.myChoice) as Choice | null,
  }
}

type Section = "new" | "connected" | "passed"

export function MatchesTab({
  mx,
  me,
  open,
  setOpen,
  onChat,
}: {
  mx: MixerState
  me: string
  open: string | null
  setOpen: (id: string | null) => void
  onChat: (introId: string) => void
}) {
  const matches = mx.attendee?.matches ?? []
  const [section, setSection] = useState<Section>("new")
  const sectionOf = (m: MatchSummary): Section => {
    const s = effective(m, mx.intros[m.introId], me).status
    return s === "connected" ? "connected" : s === "passed" ? "passed" : "new"
  }

  const current = open ? matches.find((m) => m.introId === open) : null
  if (current) {
    return <MatchDetail m={current} it={mx.intros[current.introId]} me={me} mx={mx} onBack={() => setOpen(null)} onChat={() => onChat(current.introId)} />
  }

  const counts = { new: 0, connected: 0, passed: 0 }
  for (const m of matches) counts[sectionOf(m)]++
  const list = matches.filter((m) => sectionOf(m) === section).sort((x, y) => y.createdAt - x.createdAt)

  return (
    <div className="page">
      <h1 className="page-title">Matches</h1>
      <div className="seg">
        {(["new", "connected", "passed"] as Section[]).map((s) => (
          <button key={s} className={section === s ? "on" : ""} onClick={() => setSection(s)}>
            {s === "new" ? "New" : s === "connected" ? "Connected" : "Passed"} · {counts[s]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <strong>
            {section === "new" ? "No matches yet" : section === "connected" ? "No connected matches yet" : "No passed matches"}
          </strong>
          <p>
            {section === "new"
              ? "When your agent and another agent both see a fit, the match shows up here."
              : section === "connected"
                ? "Human chat opens after both people choose Connect."
                : "Passed introductions stay here."}
          </p>
        </div>
      ) : (
        <div className="rows">
          {list.map((m) => {
            const e = effective(m, mx.intros[m.introId], me)
            const label =
              e.status === "connected"
                ? "Connected · chat open"
                : e.myChoice === "connect"
                  ? `Waiting for ${first(m.other.name)}`
                  : e.status === "passed"
                    ? "Passed"
                    : "New · review"
            return (
              <button key={m.introId} className="row-card" onClick={() => setOpen(m.introId)}>
                <Avatar id={m.other.id} role={m.other.role} size={48} />
                <span className="row-text">
                  <strong>
                    {m.other.name} · {ROLE_LABEL[m.other.role]}
                  </strong>
                  <small>{m.why}</small>
                  <em className={`status-pill s-${e.status} ${e.myChoice === "connect" && e.status === "pending" ? "s-waiting" : ""}`}>{label}</em>
                </span>
                <span className="chev">›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MatchDetail({
  m,
  it,
  me,
  mx,
  onBack,
  onChat,
}: {
  m: MatchSummary
  it?: IntroState
  me: string
  mx: MixerState
  onBack: () => void
  onChat: () => void
}) {
  const [busy, setBusy] = useState<Choice | null>(null)
  const { status, myChoice } = effective(m, it, me)
  const o = m.other

  async function decide(choice: Choice) {
    if (!mx.backend || busy || myChoice) return
    setBusy(choice)
    try {
      mx.setIntro(await mx.backend.decide(m.introId, me, choice))
      mx.refresh()
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page detail">
      <div className="topline">
        <button className="back" onClick={onBack} aria-label="Back to matches">
          ←
        </button>
        <span>Haunted Hacks · {status === "connected" ? "Connected" : "Match"}</span>
      </div>
      <div className="detail-hero">
        <div className="pair-faces">
          <Avatar id={me} role={mx.attendee?.profile?.role ?? "other"} size={58} agent />
          <Avatar id={o.id} role={o.role} size={58} />
        </div>
        <h1>Meet {first(o.name)}</h1>
        <p className="lede">
          {o.name} · {ROLE_LABEL[o.role]}
          {o.bio ? ` · ${o.bio}` : ""}
        </p>
      </div>

      <section className="cream">
        <h3>Why your agents chose this match</h3>
        <p className="why">{m.why}</p>
        {m.summary && <p className="evidence">{m.summary}</p>}
      </section>

      <div className="offers">
        <div className="cream">
          <h4>You bring</h4>
          <p>{m.youOffer}</p>
        </div>
        <div className="cream">
          <h4>{first(o.name)} brings</h4>
          <p>{m.theyOffer}</p>
        </div>
      </div>

      <section className="opener-box">
        <h4>Suggested opener</h4>
        <p>“{(it?.opener ?? m.opener).replace(/^“|”$/g, "")}”</p>
      </section>

      {status === "connected" ? (
        <>
          <div className="presence-line">You both chose Connect. Your human chat is now open.</div>
          <button className="cta cyan" onClick={onChat}>
            Open chat with {first(o.name)}
          </button>
          <MeetPanel m={m} it={it} me={me} mx={mx} />
        </>
      ) : status === "passed" ? (
        <p className="note">{myChoice === "pass" ? "You passed on this introduction." : "Not this time. Nothing was shared."}</p>
      ) : myChoice === "connect" ? (
        <div className="waiting-box">
          <span className="typing-dots">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Waiting for {first(o.name)}</strong>
            <span>You chose Connect. Contact details stay private until {first(o.name)} connects too.</span>
          </div>
        </div>
      ) : (
        <>
          <p className="note">Neither side has connected yet. Contact details stay private.</p>
          <div className="decide">
            <button className="cta ghost" onClick={() => decide("pass")} disabled={!!busy}>
              Pass
            </button>
            <button className="cta cyan" onClick={() => decide("connect")} disabled={!!busy}>
              {busy === "connect" ? "Connecting…" : "Connect"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Meet now: the meeting point is revealed only after the other person accepts. */
export function MeetPanel({ m, it, me, mx }: { m: MatchSummary; it?: IntroState; me: string; mx: MixerState }) {
  const o = m.other
  const meeting = it?.meeting
  const mn = it?.meetNow
  const contact = meeting?.contacts?.[o.id]
  const [busy, setBusy] = useState(false)

  async function meet(action: "request" | "accept") {
    if (!mx.backend) return
    setBusy(true)
    try {
      mx.setIntro(await mx.backend.meet(m.introId, me, action))
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  if (mn?.accepted) {
    return (
      <section className="meeting-card">
        <span className="meeting-state">Meet now · accepted</span>
        <div className="detail-row">
          <span className="detail-icon">P</span>
          <div>
            <small>Meeting point</small>
            <strong className="point">{meeting?.point ?? "Ask at the front desk"}</strong>
          </div>
        </div>
        <div className="detail-row">
          <span className="detail-icon">T</span>
          <div>
            <small>When</small>
            <strong>Now · {mn.requestedBy === me ? `${first(o.name)} accepted` : "you accepted"}</strong>
          </div>
        </div>
        <div className="detail-row">
          <span className="detail-icon">O</span>
          <div>
            <small>Start with this</small>
            <strong>“{(meeting?.opener ?? m.opener).replace(/^“|”$/g, "")}”</strong>
          </div>
        </div>
        {contact && (
          <div className="detail-row">
            <span className="detail-icon">C</span>
            <div>
              <small>{first(o.name)}'s contact</small>
              <strong>{contact}</strong>
            </div>
          </div>
        )}
      </section>
    )
  }

  if (mn && mn.requestedBy !== me) {
    return (
      <section className="meet-ask">
        <div>
          <strong>{first(o.name)} wants to meet now</strong>
          <span>Accept to reveal the meeting point to both of you.</span>
        </div>
        <button className="cta cyan" onClick={() => meet("accept")} disabled={busy}>
          Accept
        </button>
      </section>
    )
  }

  if (mn) {
    return (
      <div className="waiting-box">
        <span className="typing-dots">
          <i />
          <i />
          <i />
        </span>
        <div>
          <strong>Meet now request sent</strong>
          <span>Waiting for {first(o.name)} to accept. The meeting point appears when they do.</span>
        </div>
      </div>
    )
  }

  return (
    <section className="meet-start">
      <div>
        <strong>Meet now</strong>
        <span>Send {first(o.name)} a request before the meeting point is revealed.</span>
      </div>
      <button className="cta pink" onClick={() => meet("request")} disabled={busy}>
        {busy ? "Sending…" : "Send Meet now request"}
      </button>
    </section>
  )
}
