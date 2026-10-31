// Agent Mixer server: REST API + SSE on :3001, agent conversation loop, Relay bridge, seed loader.
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Choice, Profile, Role, ServerPush } from "@agent-mixer/shared"
import { ROLES } from "@agent-mixer/shared"
import type { Store } from "./store/types"
import { MemoryStore, HttpError } from "./store/memory"
import { Engine, DirectTransport } from "./agents/engine"
import { llmProvider } from "./agents/llm"
import { speed } from "./agents/engine"

export const REPO_ROOT = resolve(import.meta.dir, "../../..")

// ---------- env ----------
function loadEnv() {
  const p = join(REPO_ROOT, ".env")
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const v = m[2].replace(/^["']|["']$/g, "")
    if (v && !process.env[m[1]]) process.env[m[1]] = v
  }
}
loadEnv()
process.env.DEMO_MODE ??= "1"

// ---------- store ----------
async function makeStore(): Promise<{ store: Store; kind: string }> {
  if ((process.env.STORE ?? "memory") === "terse") {
    try {
      const mod: any = await import("./store/terse")
      const store: Store =
        typeof mod.createTerseStore === "function" ? await mod.createTerseStore()
        : typeof mod.TerseStore === "function" ? new mod.TerseStore()
        : typeof mod.default === "function" ? await mod.default()
        : mod.default ?? mod.store
      if (!store) throw new Error("store/terse.ts exports no store")
      return { store, kind: "terse" }
    } catch (e) {
      console.error("\n!!! [store] STORE=terse failed, FALLING BACK TO MEMORY STORE:", e, "\n")
    }
  }
  return { store: new MemoryStore(), kind: "memory" }
}

const { store, kind: storeKind } = await makeStore()
const engine = new Engine(store)
engine.setTransport(new DirectTransport(engine))

// ---------- seed ----------
function loadSeed(): Profile[] {
  for (const p of [join(REPO_ROOT, "docs/seed/profiles.json"), join(import.meta.dir, "../seed/profiles.json")]) {
    if (!existsSync(p)) continue
    try {
      const list = JSON.parse(readFileSync(p, "utf8")) as Profile[]
      if (Array.isArray(list) && list.length) {
        console.log(`[seed] ${list.length} profiles from ${p}`)
        return list.map((x) => ({ ...x, seeded: true }))
      }
    } catch (e) { console.error(`[seed] bad ${p}`, e) }
  }
  return []
}
const seed = loadSeed()
for (const p of seed) {
  await store.createAttendee(p)
  await store.joinEvent(p)
}

// ---------- relay ----------
let transportStatus = "direct (RELAY=0)"
let relayRef: { observerUrl: string | null } | null = null
const relayStatsRef = await import("./relay/bridge").then((m) => m.relayStats).catch(() => null)
if (process.env.RELAY !== "0") {
  try {
    const { RelayTransport } = await import("./relay/bridge")
    const relay = await Promise.race([
      RelayTransport.start(engine, REPO_ROOT),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Relay startup timed out after 25s")), 25000)),
    ])
    relayRef = relay
    for (const p of seed) await relay.ensureAgent(p)
    engine.setTransport(relay)
    transportStatus = "agent-relay"
  } catch (e) {
    transportStatus = "direct (relay failed)"
    console.error("\n!!! [relay] Agent Relay unavailable, FALLING BACK TO DIRECT IN-PROCESS TURNS:", e, "\n")
  }
}
engine.start()

// ---------- SSE ----------
interface Sub { attendee: string | null; send: (p: ServerPush) => void }
const subs = new Set<Sub>()
store.onChange((push) => {
  for (const s of subs) {
    if (push.type === "event") s.send(push)
    else if (push.type === "attendee" && push.id === s.attendee) s.send(push)
    else if (push.type === "intro" && s.attendee && (push.state.a === s.attendee || push.state.b === s.attendee)) s.send(push)
  }
})

function sse(attendee: string | null, req: Request) {
  const enc = new TextEncoder()
  let sub: Sub
  let ping: ReturnType<typeof setInterval>
  const stream = new ReadableStream({
    async start(ctrl) {
      const write = (s: string) => { try { ctrl.enqueue(enc.encode(s)) } catch { cleanup() } }
      const cleanup = () => { subs.delete(sub); clearInterval(ping) }
      sub = { attendee, send: (p) => write(`data: ${JSON.stringify(p)}\n\n`) }
      subs.add(sub)
      ping = setInterval(() => write(`: ping\n\n`), 15000)
      req.signal.addEventListener("abort", () => { cleanup(); try { ctrl.close() } catch {} })
      write(`retry: 2000\n\n`)
      sub.send({ type: "event", view: await store.eventView() })
      if (attendee) {
        const view = await store.attendeeView(attendee)
        sub.send({ type: "attendee", id: attendee, view })
        for (const m of view.matches) {
          const s = await store.intro(m.introId)
          if (s) sub.send({ type: "intro", state: s })
        }
      }
    },
    cancel() { subs.delete(sub); clearInterval(ping) },
  })
  return new Response(stream, {
    headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  })
}

// ---------- HTTP ----------
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } })

async function body(req: Request): Promise<any> {
  try { return await req.json() } catch { throw new HttpError(400, "invalid JSON body") }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "guest"
}

const roleIds = new Set(ROLES.map((r) => r.id))

async function signup(req: Request) {
  const b = await body(req)
  const name = String(b.name ?? "").trim().slice(0, 60)
  const goal = String(b.goal ?? "").trim().slice(0, 280)
  const role = String(b.role ?? "other") as Role
  if (!name || !goal) throw new HttpError(400, "name and goal are required")
  if (!roleIds.has(role)) throw new HttpError(400, `role must be one of ${[...roleIds].join(", ")}`)
  const id = `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`
  const p: Profile = {
    id, name, agentName: `${name.split(" ")[0]}'s agent`, role,
    bio: String(b.bio ?? "").trim().slice(0, 200),
    shareableGoal: goal,
    privateIntent: String(b.privateIntent ?? "").trim().slice(0, 500),
    contact: String(b.contact ?? "").trim().slice(0, 120) || `Find ${name} at Haunted Hacks`,
  }
  await store.createAttendee(p)
  if ("ensureAgent" in engine.transport && engine.transport.ensureAgent) {
    await engine.transport.ensureAgent(p).catch((e) => console.error(`[relay] ensureAgent ${id} failed`, e))
  }
  await store.joinEvent(p)
  console.log(`[signup] ${name} (${role}) -> ${id}`)
  return json({ attendeeId: id })
}

/** Contacts only leave the server once both sides chose Connect, and only to the two of them. */
function redactIntro(s: any, as: string | null) {
  if (!s) return s
  const out = structuredClone(s)
  if (out.meeting && (out.status !== "connected" || !as || (as !== out.a && as !== out.b))) out.meeting.contacts = {}
  if (!as || (as !== out.a && as !== out.b)) out.chat = []
  return out
}

const port = Number(process.env.PORT ?? 3001)
Bun.serve({
  port,
  idleTimeout: 0, // SSE streams stay open
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname
    const m = (re: RegExp) => path.match(re)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
    try {
      let r: RegExpMatchArray | null
      if (req.method === "GET" && path === "/api/health") {
        return json({ ok: true, store: storeKind, transport: engine.transport.name, transportStatus, relay: relayStatsRef, llm: llmProvider(), speed: speed() })
      }
      if (req.method === "GET" && path === "/api/observer") return json({ url: relayRef?.observerUrl ?? null })
      if (req.method === "POST" && path === "/api/signup") return await signup(req)
      if (req.method === "GET" && (r = m(/^\/api\/attendee\/([^/]+)$/))) return json(await store.attendeeView(r[1]))
      if (req.method === "GET" && path === "/api/event") return json(await store.eventView())
      if (req.method === "GET" && path === "/api/stream") return sse(url.searchParams.get("attendee"), req)
      if (req.method === "GET" && (r = m(/^\/api\/intro\/([^/]+)$/))) {
        const s = await store.intro(r[1])
        return s ? json(redactIntro(s, url.searchParams.get("as"))) : json({ error: "intro not found" }, 404)
      }
      if (req.method === "POST" && (r = m(/^\/api\/intro\/([^/]+)\/decide$/))) {
        const b = await body(req)
        const choice = b.choice as Choice
        if (choice !== "connect" && choice !== "pass") throw new HttpError(400, "choice must be connect or pass")
        return json(redactIntro(await store.decide(r[1], String(b.attendeeId), choice), String(b.attendeeId)))
      }
      if (req.method === "POST" && (r = m(/^\/api\/intro\/([^/]+)\/chat$/))) {
        const b = await body(req)
        return json(redactIntro(await store.chat(r[1], String(b.attendeeId), String(b.text ?? "")), String(b.attendeeId)))
      }
      if (req.method === "POST" && (r = m(/^\/api\/intro\/([^/]+)\/meet$/))) {
        const b = await body(req)
        const action = b.action === "accept" ? "accept" : "request"
        return json(redactIntro(await store.meet(r[1], String(b.attendeeId), action), String(b.attendeeId)))
      }
      if (req.method === "POST" && (r = m(/^\/api\/conversation\/([^/]+)\/end$/))) {
        const b = await body(req)
        await store.stopConversation(r[1], String(b.attendeeId))
        return json({ ok: true })
      }
      if (req.method === "GET" && (r = m(/^\/api\/ws\/([^/]+)\/([^/]+)$/))) {
        const t: any = store
        if (typeof t.websocketGrant === "function") return json(await t.websocketGrant(r[1], r[2]))
        return json({ error: "actor sockets need STORE=terse" }, 404)
      }
      return json({ error: "not found" }, 404)
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : typeof e?.status === "number" ? e.status : 500
      if (status >= 500) console.error(`[http] ${req.method} ${path}`, e)
      return json({ error: e?.message ?? String(e) }, status)
    }
  },
})

console.log(`[server] :${port} store=${storeKind} transport=${transportStatus} llm=${llmProvider()} demo=${process.env.DEMO_MODE}`)
