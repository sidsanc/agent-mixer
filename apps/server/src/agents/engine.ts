// Conversation loop. Each line travels through a Transport (Agent Relay DM, or direct in-process fallback);
// the listener's turn is triggered when the line is delivered to it.
import {
  DEMO, REAL, introId, type Conversation, type IntroState, type Line, type MatchSummary, type Profile,
} from "@agent-mixer/shared"
import type { Store } from "../store/types"
import { toPublic } from "../store/types"
import { decideFit, nextLine } from "./persona"

export interface LineMsg {
  conversationId: string
  a: string
  b: string
  from: string
  to: string
  lineId: string
  text: string
}

/** propose_match typed action input (docs/architecture.md, Router). `from` is the proposing agent's attendee. */
export interface ProposeMatchInput {
  conversationId: string
  from: string
  counterpartId: string
  fitScore: number
  reason: string
  youOffer: string
  theyOffer: string
  opener: string
  summary?: string
}

export interface Transport {
  readonly name: string
  /** Must eventually call engine.onDelivered(msg) exactly once per lineId (engine dedupes). */
  deliver(msg: LineMsg): Promise<void>
  /** Must eventually call engine.handleProposeMatch(input). */
  proposeMatch(fromId: string, input: ProposeMatchInput): Promise<void>
  ensureAgent?(p: Profile): Promise<void>
}

interface RunState {
  conv: Conversation
  lines: Line[]
  seen: Set<string>
  lastAt: number
  finished: boolean
}

export function speed() {
  const c = process.env.DEMO_MODE === "0" ? REAL : DEMO
  return {
    lines: Number(process.env.LINES_PER_CONVERSATION ?? c.linesPerConversation),
    msPerLine: Number(process.env.MS_PER_LINE ?? c.msPerLine),
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)))

export class Engine {
  transport!: Transport
  private runs = new Map<string, RunState>()
  private proposed = new Set<string>()
  private timer?: ReturnType<typeof setInterval>

  constructor(private store: Store) {}

  setTransport(t: Transport) { this.transport = t }

  start() {
    this.timer = setInterval(() => this.claim().catch((e) => console.error("[engine] claim", e)), 1000)
  }

  private async claim() {
    const convs = await this.store.claimPending()
    for (const c of convs) this.begin(c).catch((e) => this.fail(c, e))
  }

  private async fail(c: Conversation, e: unknown) {
    console.error(`[engine] conversation ${c.id} failed:`, e)
    const st = this.runs.get(c.id)
    if (st) st.finished = true
    await this.store.endConversation(c.id, c.a, c.b, "ended").catch(() => {})
  }

  private async profiles(c: { a: string; b: string }) {
    const [pa, pb] = await Promise.all([this.store.getProfile(c.a), this.store.getProfile(c.b)])
    if (!pa || !pb) throw new Error(`missing profile for ${c.a} or ${c.b}`)
    return [pa, pb] as const
  }

  private async begin(conv: Conversation) {
    if (this.runs.has(conv.id)) return
    const st: RunState = { conv, lines: [...conv.lines], seen: new Set(conv.lines.map((l) => l.id)), lastAt: Date.now(), finished: false }
    this.runs.set(conv.id, st)
    const [pa, pb] = await this.profiles(conv)
    // People who joined before a restart have no Relay identity in this process yet: register lazily.
    await Promise.all([this.transport.ensureAgent?.(pa), this.transport.ensureAgent?.(pb)])
    console.log(`[engine] ${conv.id}: ${pa.name} <-> ${pb.name} via ${this.transport.name}`)
    await this.speak(st, pa, pb)
  }

  /** `me` produces the next line and sends it to `other`. */
  private async speak(st: RunState, me: Profile, other: Profile) {
    const { lines: total, msPerLine } = speed()
    const startedAt = Date.now()
    const text = await nextLine(me, toPublic(other), st.lines, st.lines.length, total)
    // keep a readable rhythm: about msPerLine between lines, generation time included
    await sleep(st.lines.length === 0 ? 500 : msPerLine - (Date.now() - startedAt))
    if (st.finished || (await this.store.isStopped(st.conv.id))) return this.stopped(st)
    await this.transport.deliver({
      conversationId: st.conv.id, a: st.conv.a, b: st.conv.b, from: me.id, to: other.id,
      lineId: crypto.randomUUID(), text,
    })
  }

  private async stopped(st: RunState) {
    if (st.finished) return
    st.finished = true
    console.log(`[engine] ${st.conv.id} stopped by attendee`)
  }

  /** A line reached its listener (through Relay or directly). */
  async onDelivered(msg: LineMsg) {
    const st = this.runs.get(msg.conversationId)
    if (!st || st.finished || st.seen.has(msg.lineId)) return
    st.seen.add(msg.lineId)
    // A line still in flight (Relay DM or its fallback timer) when the phone pressed End is dropped.
    if (await this.store.isStopped(st.conv.id)) return this.stopped(st)
    const line: Line = { id: msg.lineId, from: msg.from, text: msg.text, at: Date.now() }
    st.lines = [...st.lines, line]
    st.lastAt = Date.now()
    await this.store.appendLine(st.conv.id, st.conv.a, st.conv.b, line)
    try {
      if (await this.store.isStopped(st.conv.id)) return this.stopped(st)
      const [pa, pb] = await this.profiles(st.conv)
      if (st.lines.length >= speed().lines) return await this.finish(st, pa, pb)
      const listener = msg.to === pa.id ? pa : pb
      const speaker = msg.to === pa.id ? pb : pa
      await this.speak(st, listener, speaker)
    } catch (e) {
      await this.fail(st.conv, e)
    }
  }

  private async finish(st: RunState, pa: Profile, pb: Profile) {
    st.finished = true
    const planted = !!(pa.plantedFor?.includes(pb.role) || pb.plantedFor?.includes(pa.role))
    const [da, db] = await Promise.all([
      decideFit(pa, toPublic(pb), st.lines, planted),
      decideFit(pb, toPublic(pa), st.lines, planted),
    ])
    console.log(`[engine] ${st.conv.id} decisions: ${pa.name}=${da.fit} ${pb.name}=${db.fit}`)
    if (!(da.fit && db.fit)) {
      await this.store.endConversation(st.conv.id, st.conv.a, st.conv.b, "ended")
      return
    }
    await this.transport.proposeMatch(pa.id, {
      conversationId: st.conv.id, from: pa.id, counterpartId: pb.id,
      fitScore: Math.round(Math.sqrt(Math.max(1, da.score) * Math.max(1, db.score))),
      reason: da.why, youOffer: da.iOffer, theyOffer: db.iOffer, opener: da.opener, summary: da.summary,
    })
  }

  /** Handler behind the propose_match typed action. Idempotent per conversation. */
  async handleProposeMatch(input: ProposeMatchInput) {
    const run = this.runs.get(input.conversationId)
    if (!run) throw new Error(`propose_match: unknown conversation ${input.conversationId}`)
    const { a, b } = run.conv
    if (!((input.from === a && input.counterpartId === b) || (input.from === b && input.counterpartId === a))) {
      throw new Error(`propose_match: ${input.from}/${input.counterpartId} are not the parties of ${input.conversationId}`)
    }
    const id = introId(a, b)
    if (this.proposed.has(input.conversationId)) return { introId: id, duplicate: true } // idempotency key
    this.proposed.add(input.conversationId)
    const [pa, pb] = await this.profiles(run.conv)
    const offers = input.from === a
      ? { [a]: input.youOffer, [b]: input.theyOffer }
      : { [a]: input.theyOffer, [b]: input.youOffer }
    const summaryText = input.summary || `${pa.agentName} and ${pb.agentName} found a strong fit (score ${input.fitScore}).`
    const now = Date.now()
    const state: IntroState = {
      id, a, b,
      profiles: { [a]: toPublic(pa), [b]: toPublic(pb) },
      why: input.reason, offers, summary: summaryText, opener: input.opener,
      choices: { [a]: null, [b]: null },
      status: "pending", meeting: null, meetNow: null, chat: [], createdAt: now,
    }
    const summary = (me: Profile, other: Profile): MatchSummary => ({
      introId: id, other: toPublic(other), why: input.reason, youOffer: offers[me.id], theyOffer: offers[other.id],
      summary: summaryText, opener: input.opener, myChoice: null, status: "pending", createdAt: now,
    })
    await this.store.createIntro(state, { [a]: summary(pa, pb), [b]: summary(pb, pa) })
    await this.store.endConversation(input.conversationId, a, b, "matched", id)
    console.log(`[engine] match proposed: ${id} (${pa.name} + ${pb.name}, fit ${input.fitScore})`)
    return { introId: id }
  }
}

/** In-process transport: the fallback when Relay is off or failing. */
export class DirectTransport implements Transport {
  readonly name = "direct"
  constructor(private engine: Engine) {}
  async deliver(msg: LineMsg) { queueMicrotask(() => this.engine.onDelivered(msg).catch((e) => console.error("[direct]", e))) }
  async proposeMatch(_from: string, input: ProposeMatchInput) { await this.engine.handleProposeMatch(input) }
}
