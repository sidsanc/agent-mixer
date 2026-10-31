// In-process store: dev default and demo fallback if Terse fails.
// Mirrors the Event / Attendee / Intro actors, including the Event pairing alarm.
import {
  EVENT_NAME, LEASE_MS, MAX_SLOTS, type MeetAction, type MeetNow, mutualScore, type AttendeeView, type Choice, type Conversation, type ConversationStatus,
  type EventView, type FeedItem, type IntroState, type Line, type MatchSummary, type Profile,
  type PublicProfile, type ServerPush,
} from "@agent-mixer/shared"
import { MEETING_POINTS, meetNowTtl, pairCooldownMs, summaryFields, toPublic, type Store } from "./types"

const CONV_CAP = 12
const FEED_CAP = 40

export class MemoryStore implements Store {
  private profiles = new Map<string, Profile>()
  private roster: PublicProfile[] = []
  private conversations = new Map<string, Conversation>()
  private convsByAttendee = new Map<string, string[]>()
  private matches = new Map<string, MatchSummary[]>()
  private intros = new Map<string, IntroState>()
  private feed: FeedItem[] = []
  private pending: string[] = []
  private pairsSeen = new Set<string>()
  private pairEndedAt = new Map<string, number>() // pair key -> when their last conversation ended
  private cooldownMs = pairCooldownMs()
  private pairCounter = 0
  private leases = new Map<string, number>() // conversationId -> lease expiry
  private listeners: ((p: ServerPush) => void)[] = []
  private timer: ReturnType<typeof setInterval>
  private maxParallel: number

  constructor(opts: { pairEveryMs?: number; maxParallel?: number } = {}) {
    this.maxParallel = opts.maxParallel ?? MAX_SLOTS
    this.timer = setInterval(() => this.pairTick(), opts.pairEveryMs ?? 3000)
  }

  stop() { clearInterval(this.timer) }

  // ---------- emit ----------
  onChange(fn: (push: ServerPush) => void) { this.listeners.push(fn) }
  private emit(p: ServerPush) { for (const l of this.listeners) { try { l(p) } catch (e) { console.error("[store] listener", e) } } }
  private async emitAttendee(id: string) { this.emit({ type: "attendee", id, view: await this.attendeeView(id) }) }
  private async emitEvent() { this.emit({ type: "event", view: await this.eventView() }) }
  private emitIntro(s: IntroState) { this.emit({ type: "intro", state: structuredClone(s) }) }

  // ---------- attendees ----------
  async createAttendee(p: Profile) {
    this.profiles.set(p.id, structuredClone(p))
    if (!this.convsByAttendee.has(p.id)) this.convsByAttendee.set(p.id, [])
    if (!this.matches.has(p.id)) this.matches.set(p.id, [])
    await this.emitAttendee(p.id)
  }

  async getProfile(id: string) {
    const p = this.profiles.get(id)
    return p ? structuredClone(p) : null
  }

  async attendeeView(id: string): Promise<AttendeeView> {
    const p = this.profiles.get(id)
    const convs = (this.convsByAttendee.get(id) ?? [])
      .map((c) => this.conversations.get(c)!)
      .filter(Boolean)
      .sort((x, y) => y.startedAt - x.startedAt)
      .slice(0, CONV_CAP)
    return {
      profile: p ? toPublic(p) : null,
      conversations: structuredClone(convs),
      matches: structuredClone(this.matches.get(id) ?? []).sort((x, y) => y.createdAt - x.createdAt),
    }
  }

  // ---------- event ----------
  async joinEvent(p: PublicProfile) {
    const pub = toPublic(p)
    this.roster = [...this.roster.filter((r) => r.id !== pub.id), pub]
    await this.emitEvent()
    // pair promptly so a new phone sees a conversation within seconds
    setTimeout(() => this.pairTick(), 300)
  }

  async eventView(): Promise<EventView> {
    const active = [...this.conversations.values()]
      .filter((c) => c.status === "active")
      .map((c) => ({ id: c.id, a: c.a, b: c.b, startedAt: c.startedAt }))
    const introsAll = [...this.intros.values()]
    return {
      name: EVENT_NAME,
      roster: structuredClone(this.roster),
      active,
      feed: structuredClone(this.feed),
      matchCount: introsAll.length,
      connectedCount: introsAll.filter((i) => i.status === "connected").length,
    }
  }

  private activeCount(id: string) {
    let n = 0
    for (const c of this.conversations.values()) if (c.status === "active" && (c.a === id || c.b === id)) n++
    return n
  }

  private pairKey(x: string, y: string) { return [x, y].sort().join("|") }

  /**
   * Event alarm (docs/architecture/router.md): expire stale leases, then greedily allocate
   * the highest mutualScore pairs. Max MAX_SLOTS per attendee, never the same pair twice. No LLM calls.
   */
  pairTick() {
    const now = Date.now()
    const touched = new Set<string>()
    // 1. lease expiry: a silent conversation frees both slots
    for (const c of this.conversations.values()) {
      if (c.status === "active" && now > (this.leases.get(c.id) ?? c.startedAt + LEASE_MS)) {
        c.status = "ended"
        c.endedAt = now
        this.pairEndedAt.set(this.pairKey(c.a, c.b), now)
        touched.add(c.a); touched.add(c.b)
        console.warn(`[router] lease expired: ${c.id}`)
      }
    }
    // 2. candidates: every pair not talking now and not cooling down, scored bilaterally
    const live = new Set<string>()
    for (const c of this.conversations.values()) if (c.status === "active") live.add(this.pairKey(c.a, c.b))
    const slots = new Map<string, number>()
    for (const r of this.roster) slots.set(r.id, this.maxParallel - this.activeCount(r.id))
    const cands: { a: PublicProfile; b: PublicProfile; score: number; human: boolean }[] = []
    for (let i = 0; i < this.roster.length; i++) for (let j = i + 1; j < this.roster.length; j++) {
      let a = this.roster[i], b = this.roster[j]
      const k = this.pairKey(a.id, b.id)
      if (live.has(k)) continue
      if (this.pairsSeen.has(k) && now - (this.pairEndedAt.get(k) ?? 0) < this.cooldownMs) continue
      if (a.seeded && !b.seeded) [a, b] = [b, a] // the human's agent opens
      cands.push({ a, b, score: mutualScore(a, b), human: !a.seeded || !b.seeded })
    }
    // humans first (they are why we're here), then by mutual score
    cands.sort((x, y) => Number(y.human) - Number(x.human) || y.score - x.score)
    // 3. greedy allocation; seeded-to-seeded chatter always leaves one slot free for humans
    const created: Conversation[] = []
    for (const c of cands) {
      const reserve = c.human ? 0 : 1
      if (!c.human && process.env.SEED_CHATTER === "0") continue
      if ((slots.get(c.a.id) ?? 0) <= reserve || (slots.get(c.b.id) ?? 0) <= reserve) continue
      slots.set(c.a.id, slots.get(c.a.id)! - 1)
      slots.set(c.b.id, slots.get(c.b.id)! - 1)
      this.pairsSeen.add(this.pairKey(c.a.id, c.b.id))
      live.add(this.pairKey(c.a.id, c.b.id))
      const conv: Conversation = {
        id: `c-${c.a.id}-${c.b.id}-${++this.pairCounter}`, a: c.a.id, b: c.b.id, status: "active", lines: [], startedAt: now,
      }
      this.conversations.set(conv.id, conv)
      this.leases.set(conv.id, now + LEASE_MS)
      this.convsByAttendee.set(conv.a, [...(this.convsByAttendee.get(conv.a) ?? []), conv.id])
      this.convsByAttendee.set(conv.b, [...(this.convsByAttendee.get(conv.b) ?? []), conv.id])
      this.pending = [...this.pending, conv.id]
      created.push(conv)
      touched.add(conv.a); touched.add(conv.b)
      console.log(`[router] ${conv.id} score=${c.score}`)
    }
    if (touched.size) {
      for (const id of touched) this.emitAttendee(id)
      this.emitEvent()
    }
  }

  async claimPending() {
    const ids = this.pending
    this.pending = []
    return ids.map((id) => structuredClone(this.conversations.get(id)!)).filter(Boolean)
  }

  async appendLine(conversationId: string, a: string, b: string, line: Line) {
    const c = this.conversations.get(conversationId)
    if (!c) return
    if (c.lines.some((l) => l.id === line.id)) return
    c.lines = [...c.lines, line]
    this.leases.set(conversationId, Date.now() + LEASE_MS)
    const to = line.from === a ? b : a
    this.feed = [...this.feed, { ...line, conversationId, to }].slice(-FEED_CAP)
    await Promise.all([this.emitAttendee(a), this.emitAttendee(b), this.emitEvent()])
  }

  async endConversation(conversationId: string, a: string, b: string, status: ConversationStatus, introId?: string) {
    const c = this.conversations.get(conversationId)
    if (!c) return
    if (c.status === "active") {
      c.status = status
      c.endedAt = Date.now()
      this.pairEndedAt.set(this.pairKey(c.a, c.b), c.endedAt)
    }
    if (introId) c.introId = introId
    await Promise.all([this.emitAttendee(a), this.emitAttendee(b), this.emitEvent()])
    setTimeout(() => this.pairTick(), 200)
  }

  async isStopped(conversationId: string) {
    return this.conversations.get(conversationId)?.status === "stopped"
  }

  async stopConversation(conversationId: string, by: string) {
    const c = this.conversations.get(conversationId)
    if (!c || (c.a !== by && c.b !== by)) return
    if (c.status === "active") {
      c.status = "stopped"
      c.endedAt = Date.now()
      this.pairEndedAt.set(this.pairKey(c.a, c.b), c.endedAt)
      await Promise.all([this.emitAttendee(c.a), this.emitAttendee(c.b), this.emitEvent()])
    }
  }

  // ---------- intros ----------
  async createIntro(s: IntroState, summaries: Record<string, MatchSummary>) {
    if (this.intros.has(s.id)) return // idempotent: one intro per pair
    this.intros.set(s.id, structuredClone(s))
    for (const [id, m] of Object.entries(summaries)) {
      const list = this.matches.get(id) ?? []
      if (!list.some((x) => x.introId === m.introId)) this.matches.set(id, [...list, structuredClone(m)])
      await this.emitAttendee(id)
    }
    this.emitIntro(s)
    await this.emitEvent()
  }

  async intro(id: string) {
    const s = this.intros.get(id)
    if (s) this.expireMeetNow(s)
    return s ? structuredClone(s) : null
  }

  private mustIntro(id: string, attendeeId: string) {
    const s = this.intros.get(id)
    if (!s) throw new HttpError(404, "intro not found")
    if (s.a !== attendeeId && s.b !== attendeeId) throw new HttpError(403, "not part of this intro")
    return s
  }

  private syncSummaries(s: IntroState) {
    for (const id of [s.a, s.b]) {
      this.matches.set(id, (this.matches.get(id) ?? []).map((m) =>
        m.introId === s.id ? { ...m, ...summaryFields(s, id) } : m))
    }
  }

  async decide(id: string, attendeeId: string, c: Choice) {
    const s = this.mustIntro(id, attendeeId)
    // Reversible until both Connect; then locked. Same choice twice: no-op.
    if (s.status === "connected" || s.choices[attendeeId] === c) return structuredClone(s)
    s.choices = { ...s.choices, [attendeeId]: c }
    const ca = s.choices[s.a], cb = s.choices[s.b]
    s.status = "pending"
    if (ca === "pass" || cb === "pass") s.status = "passed"
    else if (ca === "connect" && cb === "connect") {
      s.status = "connected"
      if (!s.meeting) {
        const pa = this.profiles.get(s.a), pb = this.profiles.get(s.b)
        s.meeting = {
          point: MEETING_POINTS[Math.floor(Math.random() * MEETING_POINTS.length)],
          opener: s.opener,
          contacts: { [s.a]: pa?.contact ?? "", [s.b]: pb?.contact ?? "" },
        }
      }
    }
    this.syncSummaries(s)
    this.emitIntro(s)
    await Promise.all([this.emitAttendee(s.a), this.emitAttendee(s.b), this.emitEvent()])
    return structuredClone(s)
  }

  async chat(id: string, attendeeId: string, text: string) {
    const s = this.mustIntro(id, attendeeId)
    if (s.status !== "connected") throw new HttpError(409, "chat opens after both connect")
    const t = text.trim().slice(0, 1000)
    if (!t) throw new HttpError(400, "empty message")
    s.chat = [...s.chat, { id: crypto.randomUUID(), from: attendeeId, text: t, at: Date.now() }]
    this.emitIntro(s)
    return structuredClone(s)
  }

  private expireMeetNow(s: IntroState) {
    const m = s.meetNow
    if (!m || m.status !== "requested" || !m.expiresAt || Date.now() < m.expiresAt) return false
    s.meetNow = { ...m, status: "expired", accepted: false }
    return true
  }

  /** Mirrors Intro.meet in apps/actors: request -> accept | decline | expire, then arrive. Onsite only. */
  async meet(id: string, attendeeId: string, action: MeetAction) {
    const s = this.mustIntro(id, attendeeId)
    this.expireMeetNow(s)
    if (s.status !== "connected") throw new HttpError(409, "meet opens after both connect")
    const now = Date.now()
    const m = s.meetNow
    const live = m && (m.status === "requested" || m.status === "accepted") ? m : null
    let next: MeetNow | null = m
    if (action === "request") {
      for (const pid of [s.a, s.b]) {
        if (s.profiles[pid]?.attendance === "agent-only") throw new HttpError(409, "meet now needs both people onsite")
      }
      if (live?.status === "accepted" || (live && live.requestedBy === attendeeId)) return structuredClone(s)
      if (live) next = { ...live, status: "accepted", accepted: true, respondedBy: attendeeId }
      else {
        const ttl = meetNowTtl()
        next = { requestedBy: attendeeId, at: now, accepted: false, status: "requested", expiresAt: now + ttl, arrivedBy: [] }
        setTimeout(() => { if (this.expireMeetNow(s)) this.emitIntro(s) }, ttl + 50)
      }
    } else if (action === "accept") {
      if (!live) throw new HttpError(409, "no meet now request to answer")
      if (live.status === "accepted" || live.requestedBy === attendeeId) return structuredClone(s)
      next = { ...live, status: "accepted", accepted: true, respondedBy: attendeeId }
    } else if (action === "decline") {
      if (!live) throw new HttpError(409, "no meet now request to answer")
      if (live.status === "accepted") throw new HttpError(409, "meet now was already accepted")
      next = { ...live, status: "declined", accepted: false, respondedBy: attendeeId }
    } else if (action === "arrive") {
      if (live?.status !== "accepted") throw new HttpError(409, "arrive needs an accepted meet now")
      const arrived = live.arrivedBy ?? []
      if (arrived.includes(attendeeId)) return structuredClone(s)
      next = { ...live, arrivedBy: [...arrived, attendeeId] }
    } else throw new HttpError(400, "unknown meet action")
    s.meetNow = next
    this.emitIntro(s)
    return structuredClone(s)
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
