import { useEffect, useState } from "react"
import type { Choice, IntroState, MatchSummary, MeetAction } from "@agent-mixer/shared"
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

  const [restoring, setRestoring] = useState<string | null>(null)
  const current = open ? matches.find((m) => m.introId === open) : null
  if (current) {
    return (
      <MatchDetail
        key={current.introId}
        m={current}
        it={mx.intros[current.introId]}
        me={me}
        mx={mx}
        reconsider={restoring === current.introId}
        onBack={() => {
          setRestoring(null)
          setOpen(null)
        }}
        onChat={() => onChat(current.introId)}
      />
    )
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
                : "Passed introductions stay recoverable here."}
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
                    ? e.myChoice === "pass" ? "Passed · restore any time" : "Not this time"
                    : "New · review"
            const canRestore = e.status === "passed" && e.myChoice === "pass"
            return (
              <div key={m.introId} className="row-wrap">
              <button className="row-card" onClick={() => setOpen(m.introId)}>
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
              {canRestore && (
                <button
                  className="pill-btn cyan restore"
                  onClick={() => {
                    setRestoring(m.introId)
                    setOpen(m.introId)
                  }}
                >
                  Restore match
                </button>
              )}
              </div>
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
  reconsider: startReconsider,
  onBack,
  onChat,
}: {
  m: MatchSummary
  it?: IntroState
  me: string
  mx: MixerState
  reconsider?: boolean
  onBack: () => void
  onChat: () => void
}) {
  const [busy, setBusy] = useState<Choice | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Choices stay reversible until both Connect; "reconsider" shows Connect/Pass again.
  const [reconsider, setReconsider] = useState(!!startReconsider)
  const [notice, setNotice] = useState<string | null>(null)
  const { status, myChoice } = effective(m, it, me)
  const o = m.other

  async function decide(choice: Choice, after?: () => void) {
    if (!mx.backend || busy || status === "connected") return
    setBusy(choice)
    setErr(null)
    try {
      mx.setIntro(await mx.backend.decide(m.introId, me, choice))
      after?.()
      mx.refresh()
    } catch (e) {
      console.error(e)
      setErr(String(e).includes("409") ? "This match is already locked." : "Could not save that. Try again.")
    } finally {
      setBusy(null)
    }
  }
  const choose = (choice: Choice) =>
    decide(choice, () => {
      setReconsider(false)
      setNotice(null)
    })
  const undoConnect = () =>
    decide("pass", () => {
      setReconsider(true)
      setNotice("Connect withdrawn. Nothing was shared.")
    })

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
          <div className="presence-line">You both chose Connect. This match is locked and your human chat is open.</div>
          <button className="cta cyan" onClick={onChat}>
            Open chat with {first(o.name)}
          </button>
          <MeetPanel m={m} it={it} me={me} mx={mx} />
        </>
      ) : (status === "passed" && myChoice === "pass") || reconsider ? (
        <>
          {notice ? (
            <p className="note">{notice}</p>
          ) : reconsider ? (
            <p className="note">Changed your mind? Choose again. Contact details stay private.</p>
          ) : (
            <p className="note">
              You passed. Nothing was shared.{" "}
              <button className="inline-link" onClick={() => setReconsider(true)}>
                Undo
              </button>
            </p>
          )}
          {reconsider && (
            <div className="decide">
              <button className="cta ghost" onClick={() => choose("pass")} disabled={!!busy}>
                Pass
              </button>
              <button className="cta cyan" onClick={() => choose("connect")} disabled={!!busy}>
                {busy === "connect" ? "Connecting…" : "Connect"}
              </button>
            </div>
          )}
        </>
      ) : status === "passed" ? (
        <p className="note">Not this time. Nothing was shared.</p>
      ) : myChoice === "connect" ? (
        <div className="waiting-box">
          <span className="typing-dots">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Waiting for the other person</strong>
            <span>You chose Connect. Nothing private is released until {first(o.name)} connects too.</span>
          </div>
          <button className="text-btn" onClick={undoConnect} disabled={!!busy}>
            {busy === "pass" ? "Undoing…" : "Undo"}
          </button>
        </div>
      ) : (
        <>
          <p className="note">Neither side has connected yet. Contact details stay private.</p>
          <div className="decide">
            <button className="cta ghost" onClick={() => choose("pass")} disabled={!!busy}>
              Pass
            </button>
            <button className="cta cyan" onClick={() => choose("connect")} disabled={!!busy}>
              {busy === "connect" ? "Connecting…" : "Connect"}
            </button>
          </div>
        </>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  )
}

export function attendanceOf(id: string, it: IntroState | undefined, mx: MixerState): "onsite" | "agent-only" {
  return it?.profiles?.[id]?.attendance ?? mx.profileOf(id)?.attendance ?? "onsite"
}

/** Meet now needs both people onsite. */
export function bothOnsite(m: MatchSummary, it: IntroState | undefined, me: string, mx: MixerState) {
  const mine = mx.attendee?.profile?.attendance ?? attendanceOf(me, it, mx)
  const theirs = it?.profiles?.[m.other.id]?.attendance ?? m.other.attendance ?? "onsite"
  return mine === "onsite" && theirs === "onsite"
}

function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [on])
  return now
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Meet now: request -> accept | decline | expiry; the meeting point appears only after acceptance. */
export function MeetPanel({ m, it, me, mx }: { m: MatchSummary; it?: IntroState; me: string; mx: MixerState }) {
  const o = m.other
  const meeting = it?.meeting
  const mn = it?.meetNow
  const status = mn?.status ?? (mn ? (mn.accepted ? "accepted" : "requested") : null)
  const contact = meeting?.contacts?.[o.id]
  const [busy, setBusy] = useState<MeetAction | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const now = useNow(status === "requested")

  async function meet(action: MeetAction) {
    if (!mx.backend) return
    setBusy(action)
    setErr(null)
    try {
      mx.setIntro(await mx.backend.meet(m.introId, me, action))
    } catch (e) {
      console.error(e)
      setErr(String(e).includes("409") ? "That request changed. Refreshing…" : "Could not reach the server. Try again.")
      mx.refresh()
    } finally {
      setBusy(null)
    }
  }

  if (!bothOnsite(m, it, me, mx)) {
    const meAway = (mx.attendee?.profile?.attendance ?? "onsite") !== "onsite"
    return (
      <section className="meet-start off">
        <div>
          <strong>Meet now is unavailable</strong>
          <span>
            {meAway ? "You joined agent-only" : `${first(o.name)} joined agent-only`}, so keep the conversation going in chat.
          </span>
        </div>
        <button className="coming-next" disabled>
          Schedule later <em>Coming next</em>
        </button>
      </section>
    )
  }

  if (status === "accepted") {
    const arrived = mn?.arrivedBy ?? []
    const iArrived = arrived.includes(me)
    const theyArrived = arrived.includes(o.id)
    const accepter = mn?.respondedBy ?? (mn?.requestedBy === me ? o.id : me)
    return (
      <section className="meeting-card">
        <span className="meeting-state">
          {iArrived && theyArrived ? "You both arrived · say hi" : "Meet now · accepted"}
        </span>
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
            <strong>Now · {accepter === me ? "you accepted" : `${first(o.name)} accepted`}</strong>
          </div>
        </div>
        <div className="detail-row">
          <span className="detail-icon">O</span>
          <div>
            <small>Start with this</small>
            <strong>“{(meeting?.opener ?? m.opener).replace(/^“|”$/g, "")}”</strong>
          </div>
        </div>
        <div className="detail-row">
          <span className="detail-icon">L</span>
          <div>
            <small>Look for</small>
            <strong>{contact ?? `${o.name} · ${o.role === "other" ? "attendee" : o.role}`}</strong>
          </div>
        </div>
        <div className="arrivals">
          <span className={iArrived ? "on" : ""}>{iArrived ? "✓ You're here" : "You · on your way"}</span>
          <span className={theyArrived ? "on" : ""}>
            {theyArrived ? `✓ ${first(o.name)} is here` : `${first(o.name)} · on the way`}
          </span>
        </div>
        {!iArrived && (
          <button className="cta cyan" onClick={() => meet("arrive")} disabled={!!busy}>
            {busy === "arrive" ? "Marking…" : "I've arrived"}
          </button>
        )}
        {err && <p className="err">{err}</p>}
      </section>
    )
  }

  if (status === "requested" && mn && mn.requestedBy !== me) {
    return (
      <section className="meet-ask">
        <div>
          <strong>{first(o.name)} wants to meet now</strong>
          <span>Accept to reveal the meeting point and how to find each other.</span>
        </div>
        <div className="meet-ask-actions">
          <button className="cta ghost dark" onClick={() => meet("decline")} disabled={!!busy}>
            {busy === "decline" ? "…" : "Decline"}
          </button>
          <button className="cta cyan" onClick={() => meet("accept")} disabled={!!busy}>
            {busy === "accept" ? "…" : "Accept"}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
      </section>
    )
  }

  if (status === "requested" && mn) {
    const left = mn.expiresAt ? mn.expiresAt - now : null
    return (
      <div className="waiting-box">
        <span className="typing-dots">
          <i />
          <i />
          <i />
        </span>
        <div>
          <strong>Request sent · Waiting for {first(o.name)}</strong>
          <span>
            The meeting point appears when they accept.
            {left != null && left > 0 ? ` Expires in ${mmss(left)}.` : " Expiring…"}
          </span>
        </div>
      </div>
    )
  }

  return (
    <section className="meet-start">
      <div>
        <strong>Meet now at Haunted Hacks</strong>
        <span>
          Both of you are onsite. {first(o.name)} must accept before the meeting point and identification details appear.
        </span>
      </div>
      <button className="cta pink" onClick={() => meet("request")} disabled={!!busy}>
        {busy === "request" ? "Sending…" : "Send Meet now request"}
      </button>
      {err && <p className="err">{err}</p>}
    </section>
  )
}
