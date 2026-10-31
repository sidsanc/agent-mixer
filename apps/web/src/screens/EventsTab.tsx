import { Avatar } from "../components/Avatar"
import type { MixerState } from "../useMixer"

export function EventsTab({ mx, me, onEnter }: { mx: MixerState; me: string; onEnter: () => void }) {
  const p = mx.attendee?.profile
  const convs = mx.attendee?.conversations ?? []
  const active = convs.filter((c) => c.status === "active").length
  const matches = mx.attendee?.matches.length ?? 0
  const agent = p?.agentName ?? "Your agent"
  return (
    <div className="events">
      <section className="home-hero">
        <p className="home-greeting">Good evening</p>
        <h1 className="home-name">{p?.name ?? "Guest"}</h1>
        <p className="home-kicker">Agent Mixer</p>
        <p className="home-manifesto">
          Your agent
          <br />
          works
          <br />
          the room.
        </p>
        <p className="home-tagline">You only have the conversations worth having.</p>
        <button className="hero-enter" onClick={onEnter}>
          Enter Agent World <span>→</span>
        </button>
      </section>
      <div className="home-feed">
        <button className="live-card" onClick={onEnter}>
          <div className="mission-row">
            <span className="mission-label">Mission active</span>
            <span className="live-indicator">Haunted Hacks · live</span>
          </div>
          <h4>
            {agent} is talking to {active} {active === 1 ? "agent" : "agents"}
          </h4>
          <p className="match-live">
            {matches} {matches === 1 ? "match" : "matches"}
          </p>
          <div className="agent-faces">
            <Avatar id={me} role={p?.role ?? "other"} size={44} agent />
          </div>
          <div className="live-metrics">
            <span>{convs.length} conversations</span>
            <span>{mx.event?.roster.length ?? 0} guests</span>
          </div>
        </button>
      </div>
    </div>
  )
}
