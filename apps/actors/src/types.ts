// COPY of packages/shared/src/index.ts (types only). The Terse compiler builds only src/, so the
// workspace package is not imported here. Keep in step with packages/shared when the contract changes.

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
  plantedFor?: Role[] // demo seeds: roles this agent is a strong partner for (boosts the Router score)
}

/** Full profile. privateIntent and contact never leave the server/agent boundary. */
export interface Profile extends PublicProfile {
  privateIntent: string
  contact: string
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

// ---- Router scoring (docs/architecture/router.md) ----
// Transparent heuristic. Directional score 0..100; mutual = geometric mean, so one-sided interest is penalized.

const ROLE_FIT: Record<Role, Partial<Record<Role, number>>> = {
  founder: { investor: 90, engineer: 80, designer: 70, gtm: 70, founder: 45, other: 40 },
  investor: { founder: 95, engineer: 35, other: 30, designer: 25, gtm: 25, investor: 20 },
  engineer: { founder: 85, engineer: 50, designer: 45, investor: 30, gtm: 25, other: 35 },
  designer: { founder: 85, engineer: 55, designer: 40, gtm: 30, investor: 25, other: 35 },
  gtm: { founder: 85, investor: 35, engineer: 30, designer: 30, gtm: 40, other: 35 },
  other: { founder: 60, engineer: 45, designer: 45, gtm: 45, investor: 40, other: 45 },
}

const STOP = new Set("the a an and or to of in for with on at i im my me we our you your is are be looking want meet who that this from".split(" "))
function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))
}

/** How much `from` wants to talk to `to`. */
export function directionalScore(from: PublicProfile, to: PublicProfile): number {
  const role = ROLE_FIT[from.role]?.[to.role] ?? 40
  const a = words(`${from.shareableGoal} ${from.bio}`)
  const b = words(`${to.shareableGoal} ${to.bio}`)
  let overlap = 0
  for (const w of a) if (b.has(w)) overlap++
  const text = Math.min(100, overlap * 20)
  const planted = to.plantedFor?.includes(from.role) || from.plantedFor?.includes(to.role) ? 100 : 0
  return Math.round(0.45 * role + 0.25 * text + 0.3 * planted)
}

export function mutualScore(a: PublicProfile, b: PublicProfile): number {
  return Math.round(Math.sqrt(directionalScore(a, b) * directionalScore(b, a)))
}

export const MAX_SLOTS = 3
export const LEASE_MS = 60_000 // demo: a conversation that goes silent frees its slots after this
