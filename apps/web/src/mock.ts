// In-browser stand-in for the server so every screen renders and the whole
// flow (talk -> match -> connect -> meet -> chat) can be clicked through
// before the real API is up. Matches the shared types exactly.
import {
  introId,
  MEET_NOW_TTL_MS,
  type AttendeeView,
  type Choice,
  type Conversation,
  type EventView,
  type FeedItem,
  type IntroState,
  type Line,
  type MatchSummary,
  type MeetAction,
  type PublicProfile,
  type ServerPush,
} from "@agent-mixer/shared"
import type { Backend, SignupBody } from "./backend"

const SEEDS: PublicProfile[] = [
  p("maya", "Maya Chen", "founder", "Building a real-time voice pipeline for support teams.", "Meet an investor who gets real-time voice infra"),
  p("dev", "Dev Patel", "investor", "Pre-seed at Lantern Ventures. AI infra.", "Find AI infra founders before they raise a seed"),
  p("priya", "Priya Rao", "engineer", "Ex-Stripe infra, now into agent tooling.", "Join an early team building agent tooling"),
  p("leo", "Leo Martins", "designer", "Product designer, 8 years in dev tools.", "Find a founder who needs a design partner"),
  p("sam", "Sam Okafor", "gtm", "Sold dev tools to 200+ startups.", "Help a dev-tools startup land its first 10 customers"),
  p("ines", "Ines Duarte", "founder", "Voice AI for clinics. Raised a small angel round.", "Hire a founding engineer who has shipped infra"),
  p("kai", "Kai Nakamura", "engineer", "Maintains an open-source eval library.", "Find a cofounder for an open-source eval tool"),
  p("rosa", "Rosa Lima", "investor", "Angel, ex-founder, writes $25k checks.", "Back a technical founder in the first month"),
]

function p(id: string, name: string, role: PublicProfile["role"], bio: string, goal: string): PublicProfile {
  return { id, name, agentName: `${name.split(" ")[0]}'s agent`, role, bio, shareableGoal: goal, seeded: true, attendance: "onsite" }
}

const POINTS = [
  "The coffee table by the stage",
  "The giant pumpkin by the entrance",
  "The snack bar, left side",
  "The couches under the cobweb lights",
]

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function scriptLine(me: PublicProfile, other: PublicProfile, i: number): string {
  const first = me.name.split(" ")[0]
  const theirs = other.name.split(" ")[0]
  switch (i) {
    case 0:
      return `Hi, I'm ${me.agentName}. ${first} is here to ${lower(me.shareableGoal)}. What brings ${theirs} tonight?`
    case 1:
      return `${theirs === first ? "They" : first} wants to ${lower(me.shareableGoal)}. Background: ${lower(me.bio)}`
    case 2:
      return `Interesting. Is ${theirs} looking for help on the ${other.role === "investor" ? "fundraising" : "product"} side right now, or later?`
    case 3:
      return `Right now, honestly. The timing works. What would ${theirs} want from a first conversation?`
    case 4:
      return `A quick intro and one concrete question. I think these two should talk.`
    default:
      return `Agreed. I'll suggest it to ${first}.`
  }
}

let seq = 0
const uid = (pfx: string) => `${pfx}-${Date.now().toString(36)}-${(seq++).toString(36)}`

type Listener = { attendee: string | null; fn: (p: ServerPush) => void }

class MockEngine {
  profiles = new Map<string, PublicProfile>()
  convs: Conversation[] = []
  intros = new Map<string, IntroState>()
  summaries = new Map<string, MatchSummary[]>()
  feed: FeedItem[] = []
  matchCount = 0
  connectedCount = 0
  pairsSeen = new Set<string>()
  listeners: Listener[] = []
  me: string | null = null
  started = false
  myMatchesMade = 0
  /** My matches where the other side waits for my request, then accepts a few seconds later. */
  acceptOnRequest = new Set<string>()

  constructor() {
    for (const s of SEEDS) this.profiles.set(s.id, s)
  }

  start() {
    if (this.started) return
    this.started = true
    // Warm start so the big screen is busy right away.
    for (let i = 0; i < 6; i++) this.tick()
    setInterval(() => this.tick(), 1300)
  }

  restoreMe() {
    try {
      const id = localStorage.getItem("am.attendeeId")
      const raw = localStorage.getItem("am.mockProfile")
      if (id && raw && id.startsWith("mock-")) {
        const prof = JSON.parse(raw) as PublicProfile
        this.profiles.set(prof.id, prof)
        this.me = prof.id
      }
    } catch {
      /* ignore */
    }
  }

  signup(b: SignupBody): string {
    const id = `mock-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 16)}-${Math.random().toString(36).slice(2, 6)}`
    const prof: PublicProfile = {
      id,
      name: b.name,
      agentName: `${b.name.split(" ")[0]}'s agent`,
      role: b.role,
      bio: b.bio ?? "",
      shareableGoal: b.goal,
      attendance: b.attendance ?? "onsite",
    }
    this.profiles.set(id, prof)
    this.me = id
    try {
      localStorage.setItem("am.mockProfile", JSON.stringify(prof))
    } catch {
      /* ignore */
    }
    this.emitEvent()
    return id
  }

  active() {
    return this.convs.filter((c) => c.status === "active")
  }

  busy(id: string) {
    return this.active().filter((c) => c.a === id || c.b === id).length
  }

  pair(a: string, b: string) {
    const key = [a, b].sort().join("|")
    this.pairsSeen.add(key)
    const c: Conversation = { id: `c-${a}-${b}-${seq++}`, a, b, status: "active", lines: [], startedAt: Date.now() }
    this.convs = [c, ...this.convs]
    this.emitFor(c)
  }

  fillPairs() {
    const ids = [...this.profiles.keys()]
    // Me first: up to 3 parallel conversations.
    if (this.me) {
      const candidates = ids.filter(
        (x) => x !== this.me && !this.pairsSeen.has([x, this.me!].sort().join("|")) && this.busy(x) < 1,
      )
      while (this.busy(this.me) < 3 && candidates.length) {
        const pick = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]
        this.pair(this.me, pick)
      }
    }
    // Seeds: keep the room lively, at most 5 conversations total.
    let guard = 0
    while (this.active().length < 5 && guard++ < 20) {
      const free = ids.filter((x) => x !== this.me && this.busy(x) === 0)
      if (free.length < 2) break
      const a = free[Math.floor(Math.random() * free.length)]
      const rest = free.filter((x) => x !== a)
      const b = rest[Math.floor(Math.random() * rest.length)]
      if (this.pairsSeen.has([a, b].sort().join("|")) && Math.random() < 0.7) continue
      this.pair(a, b)
    }
  }

  tick() {
    this.fillPairs()
    const act = this.active()
    if (!act.length) return
    // Prefer my conversations so the phone feels alive.
    const mine = this.me ? act.filter((c) => c.a === this.me || c.b === this.me) : []
    const c = mine.length && Math.random() < 0.65 ? mine[Math.floor(Math.random() * mine.length)] : act[Math.floor(Math.random() * act.length)]
    const n = c.lines.length
    const speaker = n % 2 === 0 ? c.a : c.b
    const other = speaker === c.a ? c.b : c.a
    const line: Line = { id: uid("l"), from: speaker, text: scriptLine(this.profiles.get(speaker)!, this.profiles.get(other)!, n), at: Date.now() }
    c.lines = [...c.lines, line]
    this.feed = [...this.feed, { ...line, conversationId: c.id, to: other }].slice(-40)
    if (c.lines.length >= 6) this.finish(c)
    this.emitFor(c)
  }

  finish(c: Conversation) {
    const involvesMe = c.a === this.me || c.b === this.me
    const match = involvesMe ? this.myMatchesMade < 2 || Math.random() < 0.4 : Math.random() < 0.45
    c.endedAt = Date.now()
    if (!match) {
      c.status = "ended"
      return
    }
    c.status = "matched"
    const iid = introId(c.a, c.b)
    c.introId = iid
    if (this.intros.has(iid)) return
    if (involvesMe) this.myMatchesMade++
    this.matchCount++
    const A = this.profiles.get(c.a)!
    const B = this.profiles.get(c.b)!
    const [a, b] = [c.a, c.b].sort()
    const offers: Record<string, string> = {
      [A.id]: offerFor(A),
      [B.id]: offerFor(B),
    }
    const intro: IntroState = {
      id: iid,
      a,
      b,
      profiles: { [A.id]: A, [B.id]: B },
      why: `${A.name.split(" ")[0]} wants to ${lower(A.shareableGoal)}, and ${B.name.split(" ")[0]} wants to ${lower(B.shareableGoal)}. Each is what the other came for.`,
      offers,
      summary: `Both agents agreed on a fit after ${c.lines.length} lines.`,
      opener: openerQ(B),
      choices: { [a]: null, [b]: null },
      status: "pending",
      meeting: null,
      meetNow: null,
      chat: [],
      createdAt: Date.now(),
    }
    this.intros.set(iid, intro)
    for (const side of [A, B]) {
      const other = side.id === A.id ? B : A
      const s: MatchSummary = {
        introId: iid,
        other,
        why: intro.why,
        youOffer: offers[side.id],
        theyOffer: offers[other.id],
        summary: intro.summary,
        opener: openerQ(other),
        myChoice: null,
        status: "pending",
        createdAt: Date.now(),
        theyConnected: false,
      }
      this.summaries.set(side.id, [s, ...(this.summaries.get(side.id) ?? [])])
    }
    // Connect requests demo: my 1st, 3rd... match -> the other side requests first (I accept or decline);
    // my 2nd, 4th... -> they wait for my request and accept it a few seconds later.
    if (involvesMe) {
      const other = a === this.me ? b : a
      if (this.myMatchesMade % 2 === 1) setTimeout(() => this.decide(iid, other, "connect"), 3000 + Math.random() * 2000)
      else this.acceptOnRequest.add(iid)
    } else {
      for (const o of [a, b]) {
        setTimeout(() => this.decide(iid, o, Math.random() < 0.7 ? "connect" : "pass"), 4000 + Math.random() * 6000)
      }
    }
    this.emitIntro(intro)
  }

  decide(iid: string, who: string, choice: Choice): IntroState {
    const it = this.intros.get(iid)
    if (!it) throw new Error("no intro")
    if (it.status === "connected" || it.choices[who] === choice) return this.introView(iid, who)
    it.choices = { ...it.choices, [who]: choice }
    const vals = Object.values(it.choices)
    if (vals.every((v) => v === "connect")) {
      it.status = "connected"
      this.connectedCount++
      it.meeting ??= {
        point: POINTS[Math.floor(Math.random() * POINTS.length)],
        opener: it.opener,
        contacts: {
          [it.a]: contactFor(it.profiles[it.a]),
          [it.b]: contactFor(it.profiles[it.b]),
        },
      }
    } else it.status = vals.includes("pass") ? "passed" : "pending"
    for (const id of [it.a, it.b]) {
      const other = id === it.a ? it.b : it.a
      this.summaries.set(
        id,
        (this.summaries.get(id) ?? []).map((s) =>
          s.introId === iid
            ? { ...s, status: this.statusFor(it, id), myChoice: it.choices[id] ?? null, theyConnected: it.choices[other] === "connect" }
            : s,
        ),
      )
    }
    // The other side accepts my request after a few seconds (unless I withdraw first).
    if (who === this.me && choice === "connect" && this.acceptOnRequest.has(iid)) {
      const other = who === it.a ? it.b : it.a
      setTimeout(() => {
        if (it.choices[who] === "connect") this.decide(iid, other, "connect")
      }, 3500)
    }
    this.emitIntro(it)
    return this.introView(iid, who)
  }

  /** Silent decline: a viewer sees "passed" only for their own Pass. */
  statusFor(it: IntroState, viewer: string): IntroState["status"] {
    if (it.status === "connected") return "connected"
    return it.choices[viewer] === "pass" ? "passed" : "pending"
  }

  chat(iid: string, who: string, text: string): IntroState {
    const it = this.intros.get(iid)!
    it.chat = [...it.chat, { id: uid("h"), from: who, text, at: Date.now() }]
    this.emitIntro(it)
    if (who === this.me) {
      const other = who === it.a ? it.b : it.a
      setTimeout(() => {
        it.chat = [...it.chat, { id: uid("h"), from: other, text: pickReply(), at: Date.now() }]
        this.emitIntro(it)
      }, 1800)
    }
    return it
  }

  meet(iid: string, who: string, action: MeetAction): IntroState {
    const it = this.intros.get(iid)!
    const other = who === it.a ? it.b : it.a
    if (action === "request") {
      const at = Date.now()
      it.meetNow = { requestedBy: who, at, accepted: false, status: "requested", expiresAt: at + MEET_NOW_TTL_MS, arrivedBy: [] }
      if (who === this.me) {
        setTimeout(() => {
          if (it.meetNow?.status === "requested") {
            it.meetNow = { ...it.meetNow, accepted: true, status: "accepted", respondedBy: other }
            this.emitIntro(it)
          }
        }, 2500)
      }
    } else if (action === "accept" || action === "decline") {
      if (it.meetNow?.status === "requested") {
        it.meetNow = { ...it.meetNow, accepted: action === "accept", status: action === "accept" ? "accepted" : "declined", respondedBy: who }
      }
    } else if (action === "arrive" && it.meetNow?.status === "accepted") {
      const arrived = it.meetNow.arrivedBy ?? []
      if (!arrived.includes(who)) it.meetNow = { ...it.meetNow, arrivedBy: [...arrived, who] }
      if (who === this.me) {
        setTimeout(() => {
          const a = it.meetNow?.arrivedBy ?? []
          if (it.meetNow && !a.includes(other)) {
            it.meetNow = { ...it.meetNow, arrivedBy: [...a, other] }
            this.emitIntro(it)
          }
        }, 3000)
      }
    }
    this.emitIntro(it)
    return it
  }

  stop(cid: string) {
    const c = this.convs.find((x) => x.id === cid)
    if (c && c.status === "active") {
      c.status = "stopped"
      c.endedAt = Date.now()
      this.emitFor(c)
    }
  }

  // --- views ---
  attendeeView(id: string): AttendeeView {
    return {
      profile: this.profiles.get(id) ?? null,
      conversations: this.convs.filter((c) => c.a === id || c.b === id).slice(0, 12).map((c) => ({ ...c })),
      matches: (this.summaries.get(id) ?? []).map((s) => ({ ...s })),
    }
  }

  eventView(): EventView {
    return {
      name: "Haunted Hacks",
      roster: [...this.profiles.values()],
      active: this.active().map(({ id, a, b, startedAt }) => ({ id, a, b, startedAt })),
      feed: [...this.feed],
      matchCount: this.matchCount,
      connectedCount: this.connectedCount,
    }
  }

  introView(iid: string, as: string): IntroState {
    const it = this.intros.get(iid)!
    const copy: IntroState = JSON.parse(JSON.stringify(it))
    if (copy.status !== "connected" && copy.meeting) copy.meeting.contacts = {}
    const other = as === copy.a ? copy.b : copy.a
    if (copy.choices[other] === "pass") copy.choices[other] = null
    copy.status = this.statusFor(it, as)
    return copy
  }

  // --- push ---
  emitEvent() {
    const view = this.eventView()
    for (const l of this.listeners) l.fn({ type: "event", view })
  }
  emitFor(c: Conversation) {
    for (const l of this.listeners) {
      if (l.attendee && (l.attendee === c.a || l.attendee === c.b)) {
        l.fn({ type: "attendee", id: l.attendee, view: this.attendeeView(l.attendee) })
      }
    }
    this.emitEvent()
  }
  emitIntro(it: IntroState) {
    for (const l of this.listeners) {
      if (l.attendee && (l.attendee === it.a || l.attendee === it.b)) {
        l.fn({ type: "intro", state: this.introView(it.id, l.attendee) })
        l.fn({ type: "attendee", id: l.attendee, view: this.attendeeView(l.attendee) })
      }
    }
    this.emitEvent()
  }
}

function offerFor(x: PublicProfile): string {
  switch (x.role) {
    case "investor":
      return "A first check and warm intros to infra buyers"
    case "founder":
      return "An early look at a fast-moving product and a real problem"
    case "engineer":
      return "Hands-on infra experience; can prototype this week"
    case "designer":
      return "A design partner who has shipped dev tools"
    case "gtm":
      return "A playbook and contacts for the first 10 customers"
    default:
      return "A fresh perspective and a useful network"
  }
}

function openerQ(x: PublicProfile): string {
  switch (x.role) {
    case "investor":
      return "What made you start investing in infra?"
    case "founder":
      return "What's the hardest part of the pipeline right now?"
    case "engineer":
      return "What's the gnarliest system you've debugged?"
    case "designer":
      return "Which dev tool has the best onboarding you've seen?"
    case "gtm":
      return "How did you land your first 10 customers last time?"
    default:
      return "What brought you here tonight?"
  }
}

function contactFor(x: PublicProfile): string {
  return `@${x.name.split(" ")[0].toLowerCase()} on Telegram`
}

const REPLIES = ["On my way!", "Love it. I'm by the snacks.", "Perfect, see you in 2 min.", "Ha, my agent said great things.", "Yes! Wearing the witch hat."]
const pickReply = () => REPLIES[Math.floor(Math.random() * REPLIES.length)]

export const engine = new MockEngine()

const later = <T,>(v: () => T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v()), ms))

export const mockBackend: Backend = {
  mode: "mock",
  signup: (b) => later(() => ({ attendeeId: engine.signup(b) }), 400),
  attendee: (id) => later(() => engine.attendeeView(id)),
  event: () => later(() => engine.eventView()),
  intro: (id, as) => later(() => engine.introView(id, as)),
  decide: (id, a, c) => later(() => engine.decide(id, a, c)),
  chat: (id, a, t) => later(() => engine.chat(id, a, t)),
  meet: (id, a, act) => later(() => engine.meet(id, a, act)),
  endConversation: (cid) => later(() => (engine.stop(cid), { ok: true })),
  subscribe(attendeeId, fn, onStatus) {
    engine.restoreMe()
    engine.start()
    const l: Listener = { attendee: attendeeId, fn }
    engine.listeners.push(l)
    onStatus?.(true)
    return () => {
      engine.listeners = engine.listeners.filter((x) => x !== l)
    }
  },
}
