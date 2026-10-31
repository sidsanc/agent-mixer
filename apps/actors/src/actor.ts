// Agent Mixer durable actors: Attendee, Event, Intro.
// Rules: no LLM calls here (so no @Interleave), reassign persisted arrays/objects (never push),
// alarms instead of timers (actors go dormant after 10s idle).
import { Actor, Emittable, Persisted } from "terse-sdk/actor"
import type {
  AttendeeView,
  Choice,
  Conversation,
  ConversationStatus,
  EventView,
  FeedItem,
  IntroState,
  Line,
  MatchSummary,
  MeetingCard,
  Profile,
  PublicProfile,
  Role,
} from "./types"
import { AVATAR_IDS, EVENT_NAME, LEASE_MS, MAX_SLOTS, MEET_NOW_TTL_MS, mutualScore } from "./types"
import type { MeetAction, MeetNow } from "./types"

const CONVERSATIONS_CAP = 10
const FEED_CAP = 40
const CHAT_CAP = 200
const STOPPED_CAP = 300

function publicPart(p: PublicProfile): PublicProfile {
  const out: PublicProfile = {
    id: p.id,
    name: p.name,
    agentName: p.agentName,
    role: p.role,
    bio: p.bio,
    shareableGoal: p.shareableGoal,
  }
  out.attendance = p.attendance === "agent-only" ? "agent-only" : "onsite"
  if (p.seeded) out.seeded = true
  if (p.avatar && AVATAR_IDS.includes(p.avatar)) out.avatar = p.avatar
  if (p.plantedFor && p.plantedFor.length) out.plantedFor = [...p.plantedFor]
  return out
}

// ---------------------------------------------------------------------------
// Attendee: one per person. Emittable view drives the phone; private fields are persisted only.
// ---------------------------------------------------------------------------

export class Attendee extends Actor<{ attendeeId: string }, { type: "ping" }, { type: "pong" }> {
  @Persisted @Emittable profile: PublicProfile | null = null
  @Persisted @Emittable conversations: Conversation[] = []
  @Persisted @Emittable matches: MatchSummary[] = []

  // Private: never emitted to sockets.
  @Persisted privateIntent = ""
  @Persisted contact = ""
  @Persisted plantedFor: Role[] = []

  async create(p: Profile): Promise<AttendeeView> {
    this.profile = publicPart(p)
    this.privateIntent = p.privateIntent ?? ""
    this.contact = p.contact ?? ""
    this.plantedFor = p.plantedFor ? [...p.plantedFor] : []
    return this.view()
  }

  /** Full profile including private fields. Server only. */
  async getProfile(): Promise<Profile | null> {
    if (!this.profile) return null
    const out: Profile = { ...this.profile, privateIntent: this.privateIntent, contact: this.contact }
    if (this.plantedFor.length) out.plantedFor = [...this.plantedFor]
    return out
  }

  async view(): Promise<AttendeeView> {
    return { profile: this.profile, conversations: this.conversations, matches: this.matches }
  }

  /** Adds the conversation (newest first) if it is not there yet. */
  async startConversation(c: Conversation): Promise<void> {
    if (this.conversations.some(x => x.id === c.id)) return
    this.conversations = [{ ...c, lines: c.lines ?? [] }, ...this.conversations].slice(0, CONVERSATIONS_CAP)
  }

  async appendLine(conversationId: string, a: string, b: string, line: Line): Promise<void> {
    const existing = this.conversations.find(c => c.id === conversationId)
    if (!existing) {
      const c: Conversation = { id: conversationId, a, b, status: "active", lines: [line], startedAt: line.at }
      this.conversations = [c, ...this.conversations].slice(0, CONVERSATIONS_CAP)
      return
    }
    if (existing.lines.some(l => l.id === line.id)) return // idempotent retry
    this.conversations = this.conversations.map(c =>
      c.id === conversationId ? { ...c, lines: [...c.lines, line] } : c,
    )
  }

  async endConversation(conversationId: string, status: ConversationStatus, introId?: string): Promise<void> {
    if (!this.conversations.some(c => c.id === conversationId)) return
    const endedAt = Date.now()
    this.conversations = this.conversations.map(c => {
      if (c.id !== conversationId) return c
      const next: Conversation = { ...c, status, endedAt: c.endedAt ?? endedAt }
      if (introId) next.introId = introId
      return next
    })
  }

  async addMatch(m: MatchSummary): Promise<void> {
    if (this.matches.some(x => x.introId === m.introId)) return
    this.matches = [m, ...this.matches]
  }

  /** status is the viewer's status (the other side's Pass reads as pending); theyConnected: the other side is waiting on me. */
  async updateMatch(introId: string, myChoice: Choice | null, status: MatchSummary["status"], theyConnected?: boolean): Promise<void> {
    const cur = this.matches.find(m => m.introId === introId)
    if (!cur) return
    const they = theyConnected ?? cur.theyConnected ?? false
    if (cur.myChoice === myChoice && cur.status === status && (cur.theyConnected ?? false) === they) return
    this.matches = this.matches.map(m => (m.introId === introId ? { ...m, myChoice, status, theyConnected: they } : m))
  }
}

// ---------------------------------------------------------------------------
// Event: roster, pairing, feed. An alarm pairs agents every tickMs. No LLM calls.
// ---------------------------------------------------------------------------

type ActiveRow = EventView["active"][number]

export class Event extends Actor<{ viewer: string }, { type: "ping" }, { type: "pong" }> {
  @Persisted @Emittable name = EVENT_NAME
  @Persisted @Emittable roster: PublicProfile[] = []
  @Persisted @Emittable active: ActiveRow[] = []
  @Persisted @Emittable feed: FeedItem[] = []
  @Persisted @Emittable matchCount = 0
  @Persisted @Emittable connectedCount = 0

  @Persisted leases: Record<string, number> = {} // conversation id -> lease expiry (ms); renewed by each line
  @Persisted pending: Conversation[] = []
  @Persisted pairsSeen: string[] = [] // "x|y" sorted, no repeat pair ever
  @Persisted talkCount: Record<string, number> = {} // conversations started per attendee
  @Persisted counter = 0
  @Persisted stopped: string[] = []
  @Persisted matchedIntros: string[] = []
  @Persisted connectedIntros: string[] = []
  @Persisted maxParallel = MAX_SLOTS
  @Persisted seedChatter = true // seeded agents may talk to each other, keeping one slot free for humans
  @Persisted tickMs = 3000
  @Persisted leaseMs = LEASE_MS // a silent or crashed conversation frees both slots after this

  async configure(opts: { maxParallel?: number; tickMs?: number; leaseMs?: number; name?: string; seedChatter?: boolean }): Promise<void> {
    if (typeof opts.seedChatter === "boolean") this.seedChatter = opts.seedChatter
    if (opts.maxParallel && opts.maxParallel > 0) this.maxParallel = opts.maxParallel
    if (opts.tickMs && opts.tickMs >= 250) this.tickMs = opts.tickMs
    if (opts.leaseMs && opts.leaseMs > 0) this.leaseMs = opts.leaseMs
    if (opts.name) this.name = opts.name
  }

  /** plantedFor is accepted for callers that still pass it separately; PublicProfile.plantedFor wins. */
  async join(p: PublicProfile, plantedFor?: Role[]): Promise<void> {
    const pub = publicPart({ ...p, plantedFor: p.plantedFor ?? plantedFor })
    const idx = this.roster.findIndex(r => r.id === pub.id)
    this.roster = idx >= 0 ? this.roster.map(r => (r.id === pub.id ? pub : r)) : [...this.roster, pub]
    armAlarm(this.alarm, 500)
  }

  async view(): Promise<EventView> {
    return {
      name: this.name,
      roster: this.roster,
      active: this.active,
      feed: this.feed,
      matchCount: this.matchCount,
      connectedCount: this.connectedCount,
    }
  }

  /** Hands pending conversations to the bridge and marks them active. */
  async claimPending(): Promise<Conversation[]> {
    if (!this.pending.length) return []
    const claimed = this.pending
    this.pending = []
    this.active = [...this.active, ...claimed.map(c => ({ id: c.id, a: c.a, b: c.b, startedAt: c.startedAt }))]
    const until = Date.now() + this.leaseMs
    const leases = { ...this.leases }
    for (const c of claimed) leases[c.id] = until
    this.leases = leases
    return claimed
  }

  async addLine(conversationId: string, a: string, b: string, line: Line): Promise<void> {
    if (this.feed.some(f => f.id === line.id && f.conversationId === conversationId)) return
    const to = line.from === a ? b : a
    this.feed = [...this.feed, { ...line, conversationId, to }].slice(-FEED_CAP)
    if (this.active.some(x => x.id === conversationId)) this.leases = { ...this.leases, [conversationId]: Date.now() + this.leaseMs }
  }

  async endConversation(conversationId: string, status: ConversationStatus, introId?: string): Promise<void> {
    this.active = this.active.filter(x => x.id !== conversationId)
    this.pending = this.pending.filter(x => x.id !== conversationId)
    if (conversationId in this.leases) this.leases = dropKey(this.leases, conversationId)
    if (status === "matched" && introId) await this.recordMatch(introId)
    armAlarm(this.alarm, 500)
  }

  /** Marks a conversation stopped (phone pressed End). Returns the pair, or null if it was not running. */
  async stopConversation(conversationId: string, by: string): Promise<{ a: string; b: string } | null> {
    const row = [...this.active, ...this.pending].find(x => x.id === conversationId)
    if (!row) return null
    if (row.a !== by && row.b !== by) throw new Error("not part of this conversation")
    if (!this.stopped.includes(conversationId)) this.stopped = [...this.stopped, conversationId].slice(-STOPPED_CAP)
    this.active = this.active.filter(x => x.id !== conversationId)
    this.pending = this.pending.filter(x => x.id !== conversationId)
    if (conversationId in this.leases) this.leases = dropKey(this.leases, conversationId)
    armAlarm(this.alarm, 500)
    return { a: row.a, b: row.b }
  }

  async isStopped(conversationId: string): Promise<boolean> {
    return this.stopped.includes(conversationId)
  }

  /** Idempotent per intro. */
  async recordMatch(introId: string): Promise<void> {
    if (this.matchedIntros.includes(introId)) return
    this.matchedIntros = [...this.matchedIntros, introId]
    this.matchCount = this.matchedIntros.length
  }

  /** Idempotent per intro. */
  async recordConnected(introId: string): Promise<void> {
    if (this.connectedIntros.includes(introId)) return
    this.connectedIntros = [...this.connectedIntros, introId]
    this.connectedCount = this.connectedIntros.length
  }

  /** Runs one pairing round now (also what the alarm does). Returns how many conversations it queued. */
  async tick(): Promise<number> {
    // Expire leases: frees both slots; refill happens in this same round.
    const now = Date.now()
    const expired = this.active.filter(x => (this.leases[x.id] ?? x.startedAt + this.leaseMs) < now).map(x => x.id)
    if (expired.length) {
      this.active = this.active.filter(x => !expired.includes(x.id))
      let leases = this.leases
      for (const id of expired) leases = dropKey(leases, id)
      this.leases = leases
    }
    // Unclaimed pending pairs also expire (bridge down), so they do not hold slots forever.
    if (this.pending.some(x => x.startedAt + this.leaseMs < now)) this.pending = this.pending.filter(x => x.startedAt + this.leaseMs >= now)
    const r = pairRound(pairingStateOf(this), this.counter)
    if (!r) return 0
    // One reassignment per field per round.
    this.counter = r.counter
    this.pairsSeen = r.pairsSeen
    this.talkCount = r.talkCount
    this.pending = [...this.pending, ...r.created]
    return r.created.length
  }

  async onAlarm(): Promise<void> {
    await this.tick()
    // Keep ticking while anything is in flight or more pairs are possible; join/end re-arm otherwise.
    if (this.active.length || this.pending.length || pairCandidates(pairingStateOf(this), true).length) {
      this.alarm.set(Date.now() + this.tickMs)
    }
  }


}

// Event pairing helpers (module functions: every actor method must be async public RPC).
interface PairingState {
  roster: PublicProfile[]
  active: ActiveRow[]
  pending: Conversation[]
  pairsSeen: string[]
  talkCount: Record<string, number>
  maxParallel: number
  seedChatter: boolean
}

function pairingStateOf(ev: PairingState): PairingState {
  return {
    roster: ev.roster, active: ev.active, pending: ev.pending, pairsSeen: ev.pairsSeen,
    talkCount: ev.talkCount, maxParallel: ev.maxParallel,
    seedChatter: ev.seedChatter,
  }
}

function armAlarm(alarm: { get(): number | null; set(ts: number): void }, inMs: number): void {
  const at = Date.now() + inMs
  const cur = alarm.get()
  if (cur === null || cur > at || cur < Date.now() - 1000) alarm.set(at)
}

function busyMap(st: PairingState): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of [...st.active, ...st.pending]) {
    m.set(c.a, (m.get(c.a) ?? 0) + 1)
    m.set(c.b, (m.get(c.b) ?? 0) + 1)
  }
  return m
}

/** Router order (docs/architecture/router.md): mutualScore desc; ties prefer pairs with a human, then newer humans. */
function humanTiebreak(st: PairingState, x: PublicProfile, y: PublicProfile): number {
  let s = 0
  for (const h of [x, y]) if (!h.seeded) s += 10 + Math.max(0, 5 - (st.talkCount[h.id] ?? 0))
  return s
}

interface Candidate { x: PublicProfile; y: PublicProfile; score: number; tie: number; order: number }

function pairCandidates(st: PairingState, ignoreBusy: boolean): Candidate[] {
  const busy = busyMap(st)
  const seen = new Set(st.pairsSeen)
  const out: Candidate[] = []
  const r = st.roster
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      const x = r[i]!
      const y = r[j]!
      if (seen.has(pairKey(x.id, y.id))) continue
      const bothSeeded = !!x.seeded && !!y.seeded
      if (bothSeeded && !st.seedChatter) continue
      const cap = bothSeeded ? st.maxParallel - 1 : st.maxParallel
      if (!ignoreBusy && ((busy.get(x.id) ?? 0) >= cap || (busy.get(y.id) ?? 0) >= cap)) continue
      out.push({ x, y, score: mutualScore(x, y), tie: humanTiebreak(st, x, y), order: i * r.length + j })
    }
  }
  return out
}

/** Pure pairing round. Returns new conversations plus the updated bookkeeping, or null if none. */
function pairRound(st: PairingState, counter: number): { created: Conversation[]; counter: number; pairsSeen: string[]; talkCount: Record<string, number> } | null {
  const cands = pairCandidates(st, false).sort((p, q) => q.score - p.score || q.tie - p.tie || p.order - q.order)
  if (!cands.length) return null
  const busy = busyMap(st)
  const seen = new Set(st.pairsSeen)
  const talk = { ...st.talkCount }
  const created: Conversation[] = []
  const now = Date.now()
  for (const { x, y } of cands) {
    const cap = x.seeded && y.seeded ? st.maxParallel - 1 : st.maxParallel
    if ((busy.get(x.id) ?? 0) >= cap || (busy.get(y.id) ?? 0) >= cap) continue
    const key = pairKey(x.id, y.id)
    if (seen.has(key)) continue
    // Initiator: the human if exactly one is human; otherwise roster order.
    const [a, b] = !x.seeded || y.seeded ? [x, y] : [y, x]
    counter += 1
    created.push({ id: `c-${a.id}-${b.id}-${counter}`, a: a.id, b: b.id, status: "active", lines: [], startedAt: now })
    seen.add(key)
    busy.set(a.id, (busy.get(a.id) ?? 0) + 1)
    busy.set(b.id, (busy.get(b.id) ?? 0) + 1)
    talk[a.id] = (talk[a.id] ?? 0) + 1
    talk[b.id] = (talk[b.id] ?? 0) + 1
  }
  if (!created.length) return null
  return { created, counter, pairsSeen: [...seen], talkCount: talk }
}

function dropKey<T>(o: Record<string, T>, k: string): Record<string, T> {
  const { [k]: _drop, ...rest } = o
  return rest
}

function pairKey(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

// ---------------------------------------------------------------------------
// Intro: one per proposed match. Exactly-once meeting card on mutual Connect. No LLM calls.
// ---------------------------------------------------------------------------

const MEETING_POINTS = [
  "The coffee table by the stage",
  "The pumpkin by the front door",
  "The snack bar, left end",
  "The couch under the projector",
  "The whiteboard wall",
]

function pickPoint(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return MEETING_POINTS[h % MEETING_POINTS.length]!
}

export class Intro extends Actor<{ attendeeId: string }, { type: "ping" }, { type: "pong" }> {
  @Persisted @Emittable state: IntroState | null = null
  @Persisted contacts: Record<string, string> = {} // private until mutual connect
  @Persisted meetingPoint = ""
  @Persisted meetingSetCount = 0 // proof of exactly-once (should never exceed 1)

  /** Idempotent: a second create for the same intro returns the existing state. */
  async create(s: IntroState, contacts: Record<string, string>, meetingPoint?: string): Promise<IntroState> {
    if (this.state) return this.state
    this.contacts = { ...contacts }
    this.meetingPoint = meetingPoint || pickPoint(s.id)
    this.state = {
      ...s,
      choices: { [s.a]: null, [s.b]: null, ...(s.choices ?? {}) },
      status: "pending",
      meeting: null,
      meetNow: null,
      chat: [],
    }
    return this.state
  }

  async get(): Promise<IntroState | null> {
    return this.state
  }

  async meetingCount(): Promise<number> {
    return this.meetingSetCount
  }

  /**
   * Records Connect or Pass. Reversible (undo) until both chose Connect; then the intro locks.
   * The same choice twice is a no-op. The meeting card is set exactly once, on mutual Connect.
   */
  async decide(attendeeId: string, choice: Choice): Promise<IntroState> {
    const s = requireParty(this.state, attendeeId)
    if (s.status === "connected" || s.choices[attendeeId] === choice) return s
    const choices = { ...s.choices, [attendeeId]: choice }
    const ca = choices[s.a]
    const cb = choices[s.b]
    let status: IntroState["status"] = "pending"
    let meeting = s.meeting
    if (ca === "pass" || cb === "pass") status = "passed"
    else if (ca === "connect" && cb === "connect") {
      status = "connected"
      if (!meeting) {
        const card: MeetingCard = {
          point: this.meetingPoint || pickPoint(s.id),
          opener: s.opener,
          contacts: { [s.a]: this.contacts[s.a] ?? "", [s.b]: this.contacts[s.b] ?? "" },
        }
        meeting = card
        this.meetingSetCount = this.meetingSetCount + 1
      }
    }
    this.state = { ...s, choices, status, meeting }
    return this.state
  }

  async chat(attendeeId: string, text: string): Promise<IntroState> {
    const s = requireParty(this.state, attendeeId)
    if (s.status !== "connected") throw new Error("chat opens after both choose Connect")
    const t = text.trim().slice(0, 1000)
    if (!t) throw new Error("empty message")
    const now = Date.now()
    const line: Line = { id: `m-${now}-${s.chat.length}`, from: attendeeId, text: t, at: now }
    this.state = { ...s, chat: [...s.chat, line].slice(-CHAT_CAP) }
    return this.state
  }

  /**
   * Meet now: request -> accept | decline | expire (after ttlMs), then each person can mark arrival.
   * Onsite only. Declined or expired returns the pair to chat; a new request can be made.
   */
  async meet(attendeeId: string, action: MeetAction, ttlMs?: number): Promise<IntroState> {
    const expired = withExpiredMeetNow(this.state)
    if (expired) this.state = expired
    const s = requireParty(this.state, attendeeId)
    if (s.status !== "connected") throw new Error("meet opens after both choose Connect")
    const now = Date.now()
    const m = s.meetNow
    const live = m && (m.status === "requested" || m.status === "accepted") ? m : null
    let next: MeetNow | null = m
    if (action === "request") {
      for (const id of [s.a, s.b]) {
        if (s.profiles[id]?.attendance === "agent-only") throw new Error("meet now needs both people onsite")
      }
      if (live?.status === "accepted") return s
      if (live && live.requestedBy === attendeeId) return s // already requested
      if (live) next = { ...live, status: "accepted", accepted: true, respondedBy: attendeeId } // they asked too: a yes
      else {
        const ttl = ttlMs && ttlMs >= 1000 ? ttlMs : MEET_NOW_TTL_MS
        next = { requestedBy: attendeeId, at: now, accepted: false, status: "requested", expiresAt: now + ttl, arrivedBy: [] }
        this.alarm.set(now + ttl + 50)
      }
    } else if (action === "accept") {
      if (!live) throw new Error("no meet now request to answer")
      if (live.status === "accepted" || live.requestedBy === attendeeId) return s
      next = { ...live, status: "accepted", accepted: true, respondedBy: attendeeId }
    } else if (action === "decline") {
      if (!live) throw new Error("no meet now request to answer")
      if (live.status === "accepted") throw new Error("meet now was already accepted")
      next = { ...live, status: "declined", accepted: false, respondedBy: attendeeId }
    } else if (action === "arrive") {
      if (live?.status !== "accepted") throw new Error("arrive needs an accepted meet now")
      const arrived = live.arrivedBy ?? []
      if (arrived.includes(attendeeId)) return s
      next = { ...live, arrivedBy: [...arrived, attendeeId] }
    } else {
      throw new Error("unknown meet action")
    }
    this.state = { ...s, meetNow: next }
    return this.state
  }

  /** Turns an unanswered request into "expired". Returns the state (also used by the server's expiry check). */
  async checkMeetNow(): Promise<IntroState | null> {
    const expired = withExpiredMeetNow(this.state)
    if (expired) this.state = expired
    return this.state
  }

  async onAlarm(): Promise<void> {
    const expired = withExpiredMeetNow(this.state)
    if (expired) this.state = expired
  }

}

/** The state with an unanswered, overdue Meet now request marked "expired", or null if nothing changes. */
function withExpiredMeetNow(s: IntroState | null): IntroState | null {
  const m = s?.meetNow
  if (!s || !m || m.status !== "requested" || !m.expiresAt || Date.now() < m.expiresAt) return null
  return { ...s, meetNow: { ...m, status: "expired", accepted: false } }
}

function requireParty(s: IntroState | null, attendeeId: string): IntroState {
  if (!s) throw new Error("intro not found")
  if (attendeeId !== s.a && attendeeId !== s.b) throw new Error("not part of this intro")
  return s
}
