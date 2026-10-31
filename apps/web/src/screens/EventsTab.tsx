import { useEffect, useState } from "react"
import type { Attendance } from "@agent-mixer/shared"
import { FALLBACK_EVENTS, joined, type EventListing } from "../backend"
import type { MixerState } from "../useMixer"

/** "Events today": Partiful-style list. Only the live event can be joined; the rest say Coming soon. */
export function EventsTab({ mx, me, onEnter }: { mx: MixerState; me: string; onEnter: () => void }) {
  const p = mx.attendee?.profile
  const [events, setEvents] = useState<EventListing[]>(FALLBACK_EVENTS)
  const [mine, setMine] = useState<Record<string, Attendance>>(() => joined.all())
  const [picking, setPicking] = useState<EventListing | null>(null)
  const [busy, setBusy] = useState<Attendance | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    mx.backend?.events(me).then(setEvents).catch(() => {})
  }, [mx.backend, me])

  async function join(ev: EventListing, attendance: Attendance) {
    if (!mx.backend) return
    setBusy(attendance)
    setErr(null)
    try {
      await mx.backend.join(ev.id, me, attendance)
      joined.set(ev.id, attendance)
      setMine(joined.all())
      setPicking(null)
      mx.refresh()
      onEnter()
    } catch (e) {
      console.error(e)
      setErr("Could not join. Try again in a second.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page events-list">
      <p className="home-greeting">Hi {p?.name.split(" ")[0] ?? "there"}</p>
      <h1 className="page-title">Events today</h1>
      <p className="hint">Join an event and {p?.agentName ?? "your agent"} starts working the room.</p>

      <div className="ev-cards">
        {events.map((ev) => {
          const isIn = ev.joined || !!mine[ev.id]
          return (
            <article key={ev.id} className={`ev-card ${ev.live ? "live" : "soon"}`} aria-disabled={!ev.live}>
              <div className="ev-top">
                {ev.live ? <span className="live-indicator">Live now</span> : <span className="ev-soon">Coming soon</span>}
                <small>{ev.when}</small>
              </div>
              <h3>{ev.name}</h3>
              <p className="ev-where">{ev.where}</p>
              <p className="ev-blurb">{ev.blurb}</p>
              {ev.live ? (
                isIn ? (
                  <button className="cta cyan" onClick={onEnter}>
                    Enter the room <span>→</span>
                  </button>
                ) : (
                  <button className="cta pink" onClick={() => setPicking(ev)}>
                    Join
                  </button>
                )
              ) : (
                <button className="cta ghost dark" disabled>
                  Coming soon
                </button>
              )}
            </article>
          )
        })}
      </div>

      {picking && (
        <div className="sheet-backdrop" onClick={() => !busy && setPicking(null)}>
          <div className="sheet" role="dialog" aria-label={`Join ${picking.name}`} onClick={(e) => e.stopPropagation()}>
            <h2>Join {picking.name}</h2>
            <p className="hint">Will you be at the venue?</p>
            <div className="attend">
              <button type="button" onClick={() => join(picking, "onsite")} disabled={!!busy}>
                <strong>{busy === "onsite" ? "Joining…" : "I'll be there"}</strong>
                <small>Onsite · Meet now unlocks after a mutual connection</small>
              </button>
              <button type="button" onClick={() => join(picking, "agent-only")} disabled={!!busy}>
                <strong>{busy === "agent-only" ? "Joining…" : "Agent only"}</strong>
                <small>Your agent attends; you keep matches and chat</small>
              </button>
            </div>
            {err && <p className="err">{err}</p>}
            <button className="text-btn" onClick={() => setPicking(null)} disabled={!!busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
