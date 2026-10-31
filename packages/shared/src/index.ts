// Shared contract for Agent Mixer. Actors, server and web all import from here.
// Change it only with a note in docs/architecture.md; all three sides depend on it.

export type Role = "founder" | "investor" | "engineer" | "designer" | "gtm" | "other"
export const ROLES: { id: Role; label: string }[] = [
  { id: "founder", label: "Founder" },
  { id: "investor", label: "Investor" },
  { id: "engineer", label: "Engineer" },
  { id: "designer", label: "Designer" },
  { id: "gtm", label: "GTM/Sales" },
  { id: "other", label: "Other" },
]

/** What other agents and other people may see. */
export interface PublicProfile {
  id: string // attendee id, [a-z0-9-]
  name: string
  agentName: string // e.g. "Ada's agent"
  role: Role
  bio: string
  shareableGoal: string // said only inside 1:1 agent conversations
  seeded?: boolean
}

/** Full profile. privateIntent and contact never leave the server/agent boundary. */
export interface Profile extends PublicProfile {
  privateIntent: string
  contact: string
  plantedFor?: Role[]
}

export interface Line {
  id: string
  from: string // attendee id of the speaker
  text: string
  at: number // epoch ms
}

export type ConversationStatus = "active" | "ended" | "matched" | "stopped"

export interface Conversation {
  id: string // "c-<a>-<b>-<n>"
  a: string // initiator attendee id
  b: string
  status: ConversationStatus
  lines: Line[]
  startedAt: number
  endedAt?: number
  introId?: string // set when it produced a match
}

export type Choice = "connect" | "pass"
export type IntroStatus = "pending" | "connected" | "passed"

/** One side's view of a match, kept in that attendee's actor. */
export interface MatchSummary {
  introId: string
  other: PublicProfile
  why: string
  youOffer: string
  theyOffer: string
  summary: string
  opener: string
  myChoice: Choice | null
  status: IntroStatus
  createdAt: number
}

export interface MeetingCard {
  point: string // e.g. "The coffee table by the stage"
  opener: string
  contacts: Record<string, string> // attendee id -> contact, released only on mutual connect
}

export interface MeetNow {
  requestedBy: string
  at: number
  accepted: boolean
}

/** Full Intro actor state (both sides subscribe to it). */
export interface IntroState {
  id: string // "i-<a>-<b>" with ids sorted
  a: string
  b: string
  profiles: Record<string, PublicProfile>
  why: string
  offers: Record<string, string> // attendee id -> what that person offers
  summary: string
  opener: string
  choices: Record<string, Choice | null>
  status: IntroStatus
  meeting: MeetingCard | null // set exactly once, when both chose connect
  meetNow: MeetNow | null
  chat: Line[] // human chat, only after connected
  createdAt: number
}

/** Attendee actor @Emittable state, what the phone renders. */
export interface AttendeeView {
  profile: PublicProfile | null
  conversations: Conversation[] // newest first, capped
  matches: MatchSummary[]
}

export interface FeedItem extends Line {
  conversationId: string
  to: string
}

/** Event actor @Emittable state, what the big screen renders. */
export interface EventView {
  name: string
  roster: PublicProfile[]
  active: { id: string; a: string; b: string; startedAt: number }[]
  feed: FeedItem[] // last 40 lines across the event
  matchCount: number
  connectedCount: number
}

/** Messages the server pushes over its own /api/events stream (fallback when actor sockets are unavailable). */
export type ServerPush =
  | { type: "attendee"; id: string; view: AttendeeView }
  | { type: "event"; view: EventView }
  | { type: "intro"; state: IntroState }

/** Demo speed vs real product. One switch: DEMO_MODE=1. */
export const DEMO = { linesPerConversation: 4, msPerLine: 4000, maxParallel: 3 }
export const REAL = { linesPerConversation: 12, msPerLine: 15000, maxParallel: 3 }

export const EVENT_ID = "haunted-hacks"

export function introId(x: string, y: string): string {
  const [a, b] = [x, y].sort()
  return `i-${a}-${b}`
}
