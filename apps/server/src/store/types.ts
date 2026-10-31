import type {
  AttendeeView, Choice, MeetAction, Conversation, ConversationStatus, EventView, IntroState, Line,
  MatchSummary, Profile, PublicProfile, ServerPush,
} from "@agent-mixer/shared"
import { MEET_NOW_TTL_MS } from "@agent-mixer/shared"

export interface Store {
  createAttendee(p: Profile): Promise<void>
  getProfile(id: string): Promise<Profile | null> // includes private fields; server only
  attendeeView(id: string): Promise<AttendeeView>
  eventView(): Promise<EventView>
  joinEvent(p: PublicProfile): Promise<void>
  claimPending(): Promise<Conversation[]> // marks them claimed
  appendLine(conversationId: string, a: string, b: string, line: Line): Promise<void> // both attendees + event feed
  endConversation(conversationId: string, a: string, b: string, status: ConversationStatus, introId?: string): Promise<void>
  isStopped(conversationId: string): Promise<boolean> // phone pressed End conversation
  stopConversation(conversationId: string, by: string): Promise<void>
  createIntro(s: IntroState, summaries: Record<string, MatchSummary>): Promise<void>
  intro(id: string): Promise<IntroState | null>
  decide(id: string, attendeeId: string, c: Choice): Promise<IntroState>
  chat(id: string, attendeeId: string, text: string): Promise<IntroState>
  meet(id: string, attendeeId: string, action: MeetAction): Promise<IntroState>
  onChange(fn: (push: ServerPush) => void): void
}

export function toPublic(p: Profile | PublicProfile): PublicProfile {
  const { id, name, agentName, role, bio, shareableGoal, seeded, plantedFor } = p
  const attendance = p.attendance === "agent-only" ? "agent-only" : "onsite"
  return { id, name, agentName, role, bio, shareableGoal, attendance, ...(seeded ? { seeded } : {}), ...(plantedFor?.length ? { plantedFor } : {}) }
}

/** Meet now request lifetime; MEET_NOW_TTL_MS env overrides (short values are handy for tests). */
export function meetNowTtl(): number {
  const v = Number(process.env.MEET_NOW_TTL_MS)
  return v >= 1000 ? v : MEET_NOW_TTL_MS
}

export const MEETING_POINTS = [
  "The coffee table by the stage",
  "The big pumpkin by the entrance",
  "The window bar at the back",
  "The couch corner under the paper bats",
  "The snack table next to the cauldron",
]

// ---------- Connect requests: visible requests, silent decline (docs/architecture.md "Connect requests") ----------

/** What `viewer` may see of the intro status: the other side's Pass never shows, so it reads as still pending. */
export function viewerStatus(s: Pick<IntroState, "a" | "b" | "choices" | "status">, viewer: string): IntroState["status"] {
  if (s.status !== "passed") return s.status
  return s.choices[viewer] === "pass" ? "passed" : "pending"
}

/** true when the other person chose Connect and is waiting on `viewer`. */
export function theyConnected(s: Pick<IntroState, "a" | "b" | "choices" | "status">, viewer: string): boolean {
  const other = viewer === s.a ? s.b : s.a
  return s.choices[other] === "connect" && viewerStatus(s, viewer) === "pending" && s.status !== "connected"
}

/** Per-viewer copy of an intro: every Pass that is not the viewer's own becomes null. */
export function maskIntro(s: IntroState, viewer: string | null): IntroState {
  const choices: IntroState["choices"] = {}
  for (const [id, c] of Object.entries(s.choices)) choices[id] = c === "pass" && id !== viewer ? null : c
  const isParty = !!viewer && (viewer === s.a || viewer === s.b)
  const status = isParty ? viewerStatus(s, viewer!) : s.status === "passed" ? "pending" : s.status
  return { ...s, choices, status }
}

/** The fields of `viewer`'s MatchSummary that follow the intro's decisions. */
export function summaryFields(s: IntroState, viewer: string): Pick<MatchSummary, "myChoice" | "status" | "theyConnected"> {
  return { myChoice: s.choices[viewer] ?? null, status: viewerStatus(s, viewer), theyConnected: theyConnected(s, viewer) }
}
