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
