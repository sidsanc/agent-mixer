import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ROLES, type Role } from "@agent-mixer/shared"
import { myId } from "../backend"
import { useBackend } from "../useMixer"

/** Event welcome + per-event setup in one screen. Under 30 seconds, no password. */
export function Signup() {
  const nav = useNavigate()
  const backend = useBackend()
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role | null>(null)
  const [goal, setGoal] = useState("")
  const [bio, setBio] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Already joined on this phone: go straight to the agent.
  useEffect(() => {
    const id = myId.get()
    if (!id || !backend) return
    if (backend.mode === "live" && id.startsWith("mock-")) return myId.clear()
    nav("/me", { replace: true })
  }, [backend, nav])

  const ready = name.trim().length > 0 && !!role && goal.trim().length > 3 && !!backend && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || !backend || !role) return
    setBusy(true)
    setErr(null)
    try {
      const { attendeeId } = await backend.signup({ name: name.trim(), role, goal: goal.trim(), bio: bio.trim() || undefined })
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
            <small>Haunted Hacks · Today</small>
          </span>
        </div>
        <h1 className="welcome-title">
          Your agent
          <br />
          works the room.
        </h1>
        <p className="welcome-sub">Meet the right people without working every corner of the event yourself.</p>
      </section>

      <form onSubmit={submit} className="setup">
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

        <label className="field">
          <span>What do you want from this event?</span>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="I'm an investor looking for AI infra founders." rows={2} maxLength={160} />
          <small className="field-note">Your agent shares this goal with other agents.</small>
        </label>

        <label className="field">
          <span>
            Short bio <em>· optional</em>
          </span>
          <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Ex-Stripe, now building voice agents" maxLength={100} />
        </label>

        {err && <p className="err">{err}</p>}

        <button className="cta cyan big" disabled={!ready}>
          {busy ? "Sending your agent in…" : "Start networking"}
        </button>
        <p className="fine">No password. Only your goal is shared.</p>
      </form>
    </div>
  )
}
