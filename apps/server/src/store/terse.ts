// Terse store: the same Store contract as memory.ts, backed by the Attendee / Event / Intro durable actors
// (apps/actors). Uses the generated client in ../generated (regenerate with
// `cd apps/server && terse actor generate --out-dir src/generated` while `terse actor dev` runs).
// Env: TERSE_ACTOR_URL (default local http://127.0.0.1:7100) and TERSE_API_KEY (hosted only).
//
// Live updates: after every mutating call we read the affected views and emit ServerPush. Event pairing
// happens inside the actor's alarm, so we also poll the event view (cheap read) and emit on change.
import {
  DEMO, EVENT_ID, REAL, type AttendeeView, type Choice, type Conversation, type ConversationStatus,
  type EventView, type IntroState, type Line, type MatchSummary, type Profile, type PublicProfile,
  type ServerPush,
} from "@agent-mixer/shared"
import { actors, ActorProxy, type ActorAuthorization } from "../generated/index.js"
import { HttpError } from "./memory"
import { MEETING_POINTS, toPublic, type Store } from "./types"

const EVENT_POLL_MS = Number(process.env.TERSE_EVENT_POLL_MS ?? 1500)

const att = (id: string) => actors.Attendee.get(id)
const ev = () => actors.Event.get(EVENT_ID)
const intro = (id: string) => actors.Intro.get(id)

/** Map actor errors (thrown as ActorInvocationError with our message) to HTTP errors the server understands. */
function mapError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e)
  if (/intro not found/.test(msg)) throw new HttpError(404, "intro not found")
  if (/not part of this/.test(msg)) throw new HttpError(403, "not part of this intro")
  if (/opens after/.test(msg)) throw new HttpError(409, msg.includes("chat") ? "chat opens after both connect" : "meet opens after both connect")
  if (/empty message/.test(msg)) throw new HttpError(400, "empty message")
  throw e
}

export class TerseStore implements Store {
  private listeners: ((p: ServerPush) => void)[] = []
  private ready: Promise<void>
  private lastEventJson = ""
  private poll: ReturnType<typeof setInterval> | null = null

  constructor() {
    const consts = process.env.DEMO_MODE === "0" ? REAL : DEMO
    this.ready = ev()
      .configure({ maxParallel: consts.maxParallel, tickMs: 3000, seedChatter: process.env.SEED_CHATTER !== "0" })
      .catch((e) => console.error("[terse] Event.configure failed", e))
  }

  stop() { if (this.poll) clearInterval(this.poll) }

  // ---------- emit ----------
  onChange(fn: (push: ServerPush) => void) {
    this.listeners.push(fn)
    if (!this.poll) this.poll = setInterval(() => { this.emitEvent().catch(() => {}) }, EVENT_POLL_MS)
  }
  private emit(p: ServerPush) {
    for (const l of this.listeners) { try { l(p) } catch (e) { console.error("[terse] listener", e) } }
  }
  private async emitAttendee(id: string) {
    if (!this.listeners.length) return
    this.emit({ type: "attendee", id, view: await this.attendeeView(id) })
  }
  private async emitEvent(force = false) {
    if (!this.listeners.length) return
    const view = await this.eventView()
    const json = JSON.stringify(view)
    if (!force && json === this.lastEventJson) return
    this.lastEventJson = json
    this.emit({ type: "event", view })
  }
  private emitIntro(s: IntroState) { this.emit({ type: "intro", state: s }) }
  private emitAll(ids: string[]) {
    // Fire-and-forget: pushes must never fail or slow the mutating call.
    Promise.all([...new Set(ids)].map((id) => this.emitAttendee(id))).catch((e) => console.error("[terse] emit", e))
    this.emitEvent().catch((e) => console.error("[terse] emit", e))
  }

  // ---------- attendees ----------
  async createAttendee(p: Profile) {
    await att(p.id).create(p)
    this.emitAll([p.id])
  }

  async getProfile(id: string): Promise<Profile | null> {
    return (await att(id).getProfile()) as Profile | null
  }

  async attendeeView(id: string): Promise<AttendeeView> {
    const v = (await att(id).view()) as AttendeeView
    return { ...v, matches: [...v.matches].sort((x, y) => y.createdAt - x.createdAt) }
  }

  // ---------- event ----------
  async eventView(): Promise<EventView> {
    return (await ev().view()) as EventView
  }

  async joinEvent(p: PublicProfile) {
    await this.ready
    const full = await this.getProfile(p.id).catch(() => null)
    await ev().join(toPublic(p), full?.plantedFor ?? [])
    this.emitEvent().catch(() => {})
  }

  async claimPending(): Promise<Conversation[]> {
    const claimed = (await ev().claimPending()) as Conversation[]
    if (!claimed.length) return []
    await Promise.all(claimed.flatMap((c) => [att(c.a).startConversation(c), att(c.b).startConversation(c)]))
    this.emitAll(claimed.flatMap((c) => [c.a, c.b]))
    return claimed
  }

  async appendLine(conversationId: string, a: string, b: string, line: Line) {
    await Promise.all([
      att(a).appendLine(conversationId, a, b, line),
      att(b).appendLine(conversationId, a, b, line),
      ev().addLine(conversationId, a, b, line),
    ])
    this.emitAll([a, b])
  }

  async endConversation(conversationId: string, a: string, b: string, status: ConversationStatus, introId?: string) {
    await Promise.all([
      att(a).endConversation(conversationId, status, introId),
      att(b).endConversation(conversationId, status, introId),
      ev().endConversation(conversationId, status, introId),
    ])
    this.emitAll([a, b])
  }

  async isStopped(conversationId: string) {
    return (await ev().isStopped(conversationId)) as boolean
  }

  async stopConversation(conversationId: string, by: string) {
    let pair: { a: string; b: string } | null = null
    try { pair = await ev().stopConversation(conversationId, by) } catch { return } // not a party: no-op, like memory
    if (!pair) return
    await Promise.all([
      att(pair.a).endConversation(conversationId, "stopped"),
      att(pair.b).endConversation(conversationId, "stopped"),
    ])
    this.emitAll([pair.a, pair.b])
  }

  // ---------- intros ----------
  async createIntro(s: IntroState, summaries: Record<string, MatchSummary>) {
    const [pa, pb] = await Promise.all([this.getProfile(s.a), this.getProfile(s.b)])
    const contacts = { [s.a]: pa?.contact ?? "", [s.b]: pb?.contact ?? "" }
    const point = MEETING_POINTS[Math.floor(Math.random() * MEETING_POINTS.length)]!
    const state = (await intro(s.id).create(s, contacts, point)) as IntroState // idempotent
    await Promise.all([
      ...Object.values(summaries).length
        ? Object.entries(summaries).map(([id, m]) => att(id).addMatch(m))
        : [],
      ev().recordMatch(s.id),
    ])
    this.emitIntro(state)
    this.emitAll(Object.keys(summaries))
  }

  async intro(id: string): Promise<IntroState | null> {
    return (await intro(id).get()) as IntroState | null
  }

  async decide(id: string, attendeeId: string, c: Choice): Promise<IntroState> {
    let s: IntroState
    try { s = (await intro(id).decide(attendeeId, c)) as IntroState } catch (e) { mapError(e) }
    await Promise.all([
      att(s.a).updateMatch(s.id, s.choices[s.a] ?? null, s.status),
      att(s.b).updateMatch(s.id, s.choices[s.b] ?? null, s.status),
      s.status === "connected" ? ev().recordConnected(s.id) : Promise.resolve(),
    ])
    this.emitIntro(s)
    this.emitAll([s.a, s.b])
    return s
  }

  async chat(id: string, attendeeId: string, text: string): Promise<IntroState> {
    let s: IntroState
    try { s = (await intro(id).chat(attendeeId, text)) as IntroState } catch (e) { mapError(e) }
    this.emitIntro(s)
    return s
  }

  async meet(id: string, attendeeId: string, action: "request" | "accept"): Promise<IntroState> {
    let s: IntroState
    try { s = (await intro(id).meet(attendeeId, action)) as IntroState } catch (e) { mapError(e) }
    this.emitIntro(s)
    return s
  }
}

/**
 * WebSocket grant for GET /api/ws/:kind/:id (optional live actor sockets).
 * Browsers receive {type:"state"} on connect and {type:"state_update", changes} after each change.
 * Only call this after the server has checked the requester may see that actor.
 */
export async function prepareWebsocket(kind: "attendee" | "event" | "intro", id: string, viewer = "anon") {
  const auth: ActorAuthorization =
    kind === "attendee" ? { actorName: "Attendee", actorId: id, metadata: { attendeeId: viewer } }
    : kind === "intro" ? { actorName: "Intro", actorId: id, metadata: { attendeeId: viewer } }
    : { actorName: "Event", actorId: EVENT_ID, metadata: { viewer } }
  const grant = await ActorProxy.handle(auth)
  return { websocketUrl: grant.websocketUrl }
}
