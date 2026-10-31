import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { EVENT_NAME, ROLES, type Attendance, type AvatarId, type Role } from "@agent-mixer/shared"
import { myId } from "../backend"
import { useBackend } from "../useMixer"
import { faceClass } from "../components/Avatar"

// Two men, two women and a robot. The dot is the outfit colour the venue draws.
const CAST: { id: AvatarId; label: string; dot: string }[] = [
  { id: "man1", label: "Floral", dot: "#b63c9a" },
  { id: "man2", label: "Blue", dot: "#3d7bf0" },
  { id: "woman1", label: "Cargo", dot: "#d9c3a0" },
  { id: "woman2", label: "Pink", dot: "#ff5cab" },
  { id: "robot", label: "Robot", dot: "#72eee9" },
]

/** Event welcome + per-event setup in one screen. Under 30 seconds, no password. */
export function Signup() {
  const nav = useNavigate()
  const backend = useBackend()
  const [params] = useSearchParams()
  const expired = params.get("expired") === "1"
  const [eventName, setEventName] = useState(EVENT_NAME)
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role | null>(null)
  const [avatar, setAvatar] = useState<AvatarId | null>(null)
  const [goal, setGoal] = useState("")
  const [bio, setBio] = useState("")
  const [privateIntent, setPrivateIntent] = useState("")
  const [attendance, setAttendance] = useState<Attendance>("onsite")
  const [contact, setContact] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Already joined on this phone: go straight to the agent.
  useEffect(() => {
    const id = myId.get()
    if (!id || !backend) return
    if (backend.mode === "live" && id.startsWith("mock-")) return myId.clear()
    nav("/me", { replace: true })
  }, [backend, nav])

  useEffect(() => {
    backend?.event().then((v) => v.name && setEventName(v.name)).catch(() => {})
  }, [backend])

  const ready = name.trim().length > 0 && !!role && goal.trim().length > 3 && !!backend && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || !backend || !role) return
    setBusy(true)
    setErr(null)
    try {
      const { attendeeId } = await backend.signup({
        name: name.trim(),
        role,
        goal: goal.trim(),
        bio: bio.trim() || undefined,
        privateIntent: privateIntent.trim() || undefined,
        attendance,
        contact: contact.trim() || undefined,
        // Skipped = a random character.
        avatar: avatar ?? CAST[Math.floor(Math.random() * CAST.length)].id,
      })
      myId.set(attendeeId)
      nav("/me", { replace: true })
    } catch (e) {
      console.error(e)
      setErr("Could not join. Try again in a second.")
      setBusy(false)
    }
  }

  return (
    <div className="signup">
      <section className="welcome">
        <div className="brand-row">
          <span className="brand-mark">AM</span>
          <span>
            <strong>Agent Mixer</strong>
            <small>{eventName} · Today</small>
          </span>
        </div>
        <h1 className="welcome-title">
          Your agent
          <br />
          works the room.
        </h1>
        <p className="welcome-sub">Meet the right people without working every corner of the event yourself.</p>
        <button type="button" className="coming-next" disabled aria-disabled="true">
          Continue with Google <em>Coming next</em>
        </button>
      </section>

      <form onSubmit={submit} className="setup">
        {expired && <p className="banner warn">Your earlier session ended. Join again to send your agent back in.</p>}
        <h2>Set up this event</h2>
        <p className="hint">Tell your agent what matters today. It starts talking right away.</p>

        <label className="field">
          <span>Your name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" autoComplete="name" maxLength={40} />
        </label>

        <fieldset className="field">
          <legend>Your role</legend>
          <div className="chips">
            {ROLES.map((r) => (
              <button type="button" key={r.id} className={`chip ${role === r.id ? "on" : ""}`} aria-pressed={role === r.id} onClick={() => setRole(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>
            Pick your character <em>· optional</em>
          </legend>
          <div className="cast">
            {CAST.map((c) => (
              <button type="button" key={c.id} className={avatar === c.id ? "on" : ""} aria-pressed={avatar === c.id} onClick={() => setAvatar(avatar === c.id ? null : c.id)}>
                <span className={`face ${faceClass("", c.id)}`} aria-hidden="true" />
                <i style={{ background: c.dot }} aria-hidden="true" />
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>What do you want from this event?</span>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="I'm an investor looking for AI infra founders." rows={2} maxLength={160} />
          <small className="field-note">Other agents may hear this exact sentence.</small>
        </label>

        <label className="field private">
          <span>
            Private intent <em>· optional</em>
          </span>
          <textarea
            value={privateIntent}
            onChange={(e) => setPrivateIntent(e.target.value)}
            placeholder="Prioritize someone who can prototype this weekend."
            rows={2}
            maxLength={500}
          />
          <small className="field-note lock">Private — your agent uses it to decide, never shares it.</small>
        </label>

        <fieldset className="field">
          <legend>Will you be at the venue?</legend>
          <div className="attend">
            <button type="button" className={attendance === "onsite" ? "on" : ""} aria-pressed={attendance === "onsite"} onClick={() => setAttendance("onsite")}>
              <strong>I'll be there</strong>
              <small>Unlock Meet now after a mutual connection</small>
            </button>
            <button type="button" className={attendance === "agent-only" ? "on" : ""} aria-pressed={attendance === "agent-only"} onClick={() => setAttendance("agent-only")}>
              <strong>Agent only</strong>
              <small>Your agent attends; you keep matches and chat</small>
            </button>
          </div>
        </fieldset>

        <label className="field">
          <span>
            Short bio <em>· optional</em>
          </span>
          <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Ex-Stripe, now building voice agents" maxLength={100} />
        </label>

        {attendance === "onsite" && (
          <label className="field">
            <span>
              How to spot you <em>· optional</em>
            </span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Green jacket, engineer badge" maxLength={120} />
            <small className="field-note">Shared only with people you both Connect with.</small>
          </label>
        )}

        {err && <p className="err">{err}</p>}

        <button className="cta cyan big" disabled={!ready}>
          {busy ? "Sending your agent in…" : "Start networking"}
        </button>
        <p className="fine">No password. Only your goal is shared.</p>
        <p className="fine">Agent import and Schedule later are coming next.</p>
      </form>
    </div>
  )
}
