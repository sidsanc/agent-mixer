// Agent Relay transport. Every attendee is its own Relay agent (am-<id>); every line is a Relay DM
// from speaker to listener, and the listener's turn starts when the DM arrives (dm.received).
// propose_match is a typed Relay action registered by the bridge's matchmaker agent.
// If Relay is slow or down, each step falls back to direct in-process delivery after RELAY_WAIT_MS,
// logged loudly, so the demo never stalls. The engine dedupes, so a late Relay copy is ignored.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { AgentRelay } from "@agent-relay/sdk"
import { z } from "zod"
import type { Profile } from "@agent-mixer/shared"
import type { Engine, LineMsg, ProposeMatchInput, Transport } from "../agents/engine"

// RELAY_BASE_URL=http://127.0.0.1:8787/v1 selects the self-hosted engine (`bun run dev:relay`); unset = hosted.
const LOCAL = !!process.env.RELAY_BASE_URL
const ORIGIN = (process.env.RELAY_BASE_URL || "https://cast.agentrelay.com").replace(/\/+$/, "").replace(/\/v1$/, "")
const BASE = `${ORIGIN}/v1`
const KEY_VAR = LOCAL ? "RELAY_LOCAL_WORKSPACE_KEY" : "RELAY_WORKSPACE_KEY"
const WAIT_MS = Number(process.env.RELAY_WAIT_MS ?? 5000)
const ACTION = "propose_match"
const MATCHMAKER = "am-matchmaker"

const ProposeMatch = z.object({
  conversationId: z.string(),
  from: z.string().describe("attendee id of the proposing agent"),
  counterpartId: z.string(),
  fitScore: z.number().min(0).max(100),
  reason: z.string(),
  youOffer: z.string(),
  theyOffer: z.string(),
  opener: z.string(),
  summary: z.string().optional(),
})

// RelayAgentClient (+ registerAction at runtime); typed loosely because the SDK union type is awkward
type Client = any

export const relayStats = { dmSent: 0, dmViaRelay: 0, dmFallback: 0, sendErrors: 0, actionViaRelay: 0, actionFallback: 0, dmLate: 0, lastSendMs: 0, events: 0 }

export class RelayTransport implements Transport {
  readonly name = "agent-relay"
  private clients = new Map<string, Client>() // attendee id -> live client
  private connecting = new Map<string, Promise<Client | null>>()
  private pending = new Map<string, { msg: LineMsg; timer: ReturnType<typeof setTimeout> }>() // key: from|text
  private tokens: Record<string, string> = {}
  private tokenFile: string
  private keyTag: string
  private matchmaker?: Client
  observerUrl: string | null = null

  private constructor(private engine: Engine, private relay: AgentRelay, private key: string, repoRoot: string) {
    this.tokenFile = join(repoRoot, "apps/server/.relay-tokens.json")
    this.keyTag = createHash("sha256").update(key).digest("hex").slice(0, 10)
    if (existsSync(this.tokenFile)) {
      try { this.tokens = JSON.parse(readFileSync(this.tokenFile, "utf8")) } catch {}
    }
  }

  static async start(engine: Engine, repoRoot: string): Promise<RelayTransport> {
    let key = process.env[KEY_VAR]
    if (!key) key = await createWorkspace(repoRoot)
    console.log(`[relay] using ${LOCAL ? `self-hosted engine at ${ORIGIN}` : "hosted Relaycast"}`)
    const relay = new AgentRelay({
      ...(LOCAL ? { baseUrl: ORIGIN } : {}),
      workspaceKey: key,
      onError: (e: any, ctx: any) => {
        console.warn(`[relay] error (${ctx?.selector ?? ctx?.action ?? "?"} ${ctx?.operation ?? ""}): ${e?.message ?? e}`)
        if (ctx?.action === ACTION && ctx?.operation === "register") t?.retryAction()
      },
    })
    let t: RelayTransport
    t = new RelayTransport(engine, relay, key, repoRoot)
    relay.addListener("dm.received", (e: any) => t.onDm(e))
    relay.addListener("message.created", (e: any) => { if (!e.envelope?.channel) t.onDm(e) })
    await t.setupMatchmaker()
    t.createObserver().catch(() => {})
    console.log(`[relay] bridge up: workspace ${t.keyTag}, action ${ACTION} on @${MATCHMAKER}`)
    return t
  }

  private saveTokens() {
    try { writeFileSync(this.tokenFile, JSON.stringify(this.tokens, null, 2)) } catch (e) { console.warn("[relay] could not save tokens", e) }
  }

  /** Register once, then reconnect with the saved token on every restart (registration is create-only). */
  private async connect(name: string): Promise<Client> {
    const tk = `${this.keyTag}:${name}`
    const saved = this.tokens[tk]
    if (saved) {
      try { return (await this.relay.workspace.reconnect({ apiToken: saved })) as Client }
      catch (e: any) { console.warn(`[relay] reconnect ${name} failed (${e?.message}); registering a fresh identity`) }
    }
    let regName = name
    for (let i = 0; i < 3; i++) {
      try {
        const c = (await this.relay.workspace.register({ name: regName, type: "agent" })) as Client
        this.tokens[tk] = c.token!
        this.saveTokens()
        return c
      } catch (e: any) {
        const msg = String(e?.code ?? e?.message ?? e)
        if (/conflict|409|exists/i.test(msg)) regName = `${name}-${Math.random().toString(36).slice(2, 6)}`
        else if (i === 2) throw e
        else await new Promise((r) => setTimeout(r, 1000))
      }
    }
    throw new Error(`could not register ${name}`)
  }

  private actionHandle: any
  private actionRetries = 0
  retryAction() {
    if (this.actionRetries >= 10) return
    const n = ++this.actionRetries
    setTimeout(() => {
      console.log(`[relay] re-registering ${ACTION} (attempt ${n + 1})`)
      try { this.actionHandle?.unregister() } catch {}
      this.registerProposeMatch()
    }, 3000 * n)
  }

  private async setupMatchmaker() {
    this.matchmaker = await this.connect(MATCHMAKER)
    this.registerProposeMatch()
  }

  private registerProposeMatch() {
    this.actionHandle = this.matchmaker.registerAction({
      name: ACTION,
      description: "Propose an introduction between two attendees after a 1:1 agent conversation found a fit. Humans still choose Connect or Pass.",
      input: ProposeMatch,
      handler: async ({ input }: { input: any }) => {
        relayStats.actionViaRelay++
        console.log(`[relay] ${ACTION} invoked over Relay for ${input.conversationId}`)
        return await this.engine.handleProposeMatch(input as ProposeMatchInput)
      },
    })
  }

  private regChain: Promise<unknown> = Promise.resolve()
  private seeded = new Set<string>()

  /** Called at signup and for seeds. Registrations run one at a time (Relaycast rate-limits bursts) and retry. */
  async ensureAgent(p: Profile, attempt = 0): Promise<void> {
    if (p.seeded) this.seeded.add(p.id)
    if (this.clients.has(p.id) || this.connecting.has(p.id)) return
    // humans skip the queue so a fresh phone gets its Relay identity right away
    const reg = p.seeded ? this.regChain.then(() => this.connect(`am-${p.id}`)) : this.connect(`am-${p.id}`)
    if (p.seeded) this.regChain = reg.catch(() => null)
    const job: Promise<Client | null> = reg
      .then((c: Client) => { this.clients.set(p.id, c); console.log(`[relay] agent @${c.name} online for ${p.name}`); return c })
      .catch((e: any) => {
        console.error(`[relay] !!! agent for ${p.id} unavailable (attempt ${attempt + 1}): ${e?.message ?? e}`)
        if (attempt < 8) setTimeout(() => this.ensureAgent(p, attempt + 1), 4000 * (attempt + 1))
        return null
      })
      .finally(() => this.connecting.delete(p.id))
    this.connecting.set(p.id, job)
  }

  private async client(id: string): Promise<Client | null> {
    if (this.clients.has(id)) return this.clients.get(id)!
    const c = this.connecting.get(id)
    if (c) return await Promise.race([c, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
    return null
  }

  async deliver(msg: LineMsg) {
    // The free Relaycast plan caps workspace writes, so background chatter between two seeded agents
    // stays in-process unless RELAY_SEED_CHATTER=1. Every conversation with a human goes over Relay.
    if (process.env.RELAY_SEED_CHATTER !== "1" && this.seeded.has(msg.from) && this.seeded.has(msg.to)) {
      queueMicrotask(() => this.engine.onDelivered(msg).catch((e) => console.error("[relay] local deliver", e)))
      return
    }
    const key = `${msg.from}|${msg.text}`
    const fallback = (why: string) => {
      if (!this.pending.has(key)) return
      this.pending.delete(key)
      relayStats.dmFallback++
      console.warn(`[relay] !!! FALLBACK direct delivery for ${msg.conversationId} (${why})`)
      this.engine.onDelivered(msg).catch((e) => console.error("[relay] fallback deliver", e))
    }
    this.pending.set(key, { msg, timer: setTimeout(() => fallback(`no DM within ${WAIT_MS}ms`), WAIT_MS) })
    const [from, to] = await Promise.all([this.client(msg.from), this.client(msg.to)])
    if (!from || !to) return fallback("agent not registered on Relay")
    relayStats.dmSent++
    const t0 = Date.now()
    from.sendMessage({ to: `@${to.name}`, text: msg.text, metadata: { conversationId: msg.conversationId, lineId: msg.lineId } })
      .then(() => { relayStats.lastSendMs = Date.now() - t0 })
      .catch((e: any) => { relayStats.sendErrors++; fallback(`send failed: ${e?.message ?? e}`) })
  }

  private onDm(e: any) {
    relayStats.events++
    const fromName: string | undefined = e?.message?.from?.name ?? e?.envelope?.from?.name
    const text: string | undefined = e?.message?.text
    if (!fromName || text == null) return
    let fromId: string | undefined
    for (const [id, c] of this.clients) if (c.name === fromName) fromId = id
    if (!fromId) return
    const key = `${fromId}|${text}`
    const p = this.pending.get(key)
    if (!p) { relayStats.dmLate++; return } // duplicate event, or already delivered by fallback
    this.pending.delete(key)
    clearTimeout(p.timer)
    relayStats.dmViaRelay++
    this.engine.onDelivered(p.msg).catch((err) => console.error("[relay] deliver", err))
  }

  async proposeMatch(fromId: string, input: ProposeMatchInput) {
    if (process.env.RELAY_SEED_CHATTER !== "1" && this.seeded.has(input.from) && this.seeded.has(input.counterpartId)) {
      await this.engine.handleProposeMatch(input)
      return
    }
    let done = false
    const direct = async (why: string) => {
      if (done) return
      done = true
      relayStats.actionFallback++
      console.warn(`[relay] !!! FALLBACK direct ${ACTION} for ${input.conversationId} (${why})`)
      await this.engine.handleProposeMatch(input).catch((e) => console.error(`[relay] ${ACTION}`, e))
    }
    const timer = setTimeout(() => direct(`not handled within ${WAIT_MS * 2}ms`), WAIT_MS * 2)
    const done$ = this.relay.addListener("action.completed", (ev: any) => {
      if (ev?.input?.conversationId === input.conversationId || ev?.action === ACTION) { done = true; clearTimeout(timer) }
    })
    try {
      const c = await this.client(fromId)
      if (!c?.token) throw new Error("caller not on Relay")
      // invoke as the proposing attendee's own Relay identity
      const messaging: any = (this.relay as any).messagingForToken(c.token)
      // The local engine sometimes rejects an invoke while it is still dispatching; retry once.
      await messaging.commands.invoke(ACTION, input as any)
        .catch(async () => { await new Promise((r) => setTimeout(r, 500)); return messaging.commands.invoke(ACTION, input as any) })
      console.log(`[relay] @${c.name} invoked ${ACTION} for ${input.conversationId}`)
    } catch (e: any) {
      clearTimeout(timer)
      await direct(`invoke failed: ${e?.message ?? e}`)
    } finally {
      setTimeout(() => done$(), WAIT_MS * 3)
    }
  }

  /** Read-only observer link for the big screen (best effort). */
  private async createObserver() {
    if (LOCAL) return // agentrelay.com/observer only reads the hosted engine
    const tk = `${this.keyTag}:observer`
    if (this.tokens[tk]) { this.observerUrl = this.tokens[tk]; return }
    const res = await fetch(`${BASE}/observer-tokens`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "agent-mixer-big-screen", scopes: ["stream:read"] }),
    })
    const j: any = await res.json().catch(() => null)
    const tok = j?.data?.token ?? j?.data?.observer_token ?? j?.token
    if (!res.ok || !tok) { console.warn(`[relay] observer token unavailable (${res.status} ${j?.error?.message ?? ""})`); return }
    this.observerUrl = `https://agentrelay.com/observer?key=${tok}`
    this.tokens[tk] = this.observerUrl
    this.saveTokens()
  }
}

async function createWorkspace(repoRoot: string): Promise<string> {
  const res = await fetch(`${BASE}/workspaces`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "agent-mixer" }),
  })
  const j: any = await res.json()
  const key = j?.data?.api_key
  if (!key) throw new Error(`workspace create failed: ${res.status}`)
  appendFileSync(join(repoRoot, ".env"), `\n${KEY_VAR}=${key}\n`)
  process.env[KEY_VAR] = key
  console.log(`[relay] created a new Relay workspace on ${ORIGIN} and saved ${KEY_VAR} to .env`)
  return key
}
