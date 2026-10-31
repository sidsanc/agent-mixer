// Agent Mixer server: REST API + SSE on :3001, agent conversation loop, Relay bridge, seed loader.
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Attendance, Choice, MeetAction, Profile, Role, ServerPush } from "@agent-mixer/shared"
import { AVATAR_IDS, EVENT_ID, EVENT_NAME, ROLES } from "@agent-mixer/shared"
import type { Store } from "./store/types"
import { MemoryStore, HttpError } from "./store/memory"
import { Engine, DirectTransport } from "./agents/engine"
import { llmProvider, llmStats } from "./agents/llm"
import { maskIntro, meetNowTtl, toPublic } from "./store/types"
import { speed } from "./agents/engine"
import { SeedHumans } from "./agents/seedHuman"

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
// STORE=terse is the default; STORE=memory forces the in-process store. If the Terse actors are not
// reachable at startup we fall back to memory, loudly, so the demo still runs.
const TERSE_PROBE_MS = Number(process.env.TERSE_PROBE_MS ?? 4000)

function loud(msg: string, e?: unknown) {
  const bar = "!".repeat(78)
  console.error(`\n${bar}\n!!! ${msg}\n!!! ${e instanceof Error ? e.message : e ?? ""}\n${bar}\n`)
}

async function makeStore(): Promise<{ store: Store; kind: string }> {
  if ((process.env.STORE || "terse") !== "memory") {
    try {
      const mod = await import("./store/terse")
      // Probe with a real read so a dead :7100 (or bad hosted URL/key) is caught before we commit to it.
      await Promise.race([
        mod.probeTerse(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer from Terse in ${TERSE_PROBE_MS}ms`)), TERSE_PROBE_MS)),
      ])
      return { store: new mod.TerseStore(), kind: "terse" }
    } catch (e) {
      loud(`[store] Terse actors unreachable (${process.env.TERSE_ACTOR_URL || "http://127.0.0.1:7100"}): FALLING BACK TO MEMORY STORE`, e)
    }
  }
  return { store: new MemoryStore(), kind: "memory" }
}

const { store, kind: storeKind } = await makeStore()
const engine = new Engine(store)
// Seeds answer Connect, chat and Meet now as their own human (SEED_HUMANS=0 turns it off).
if (process.env.SEED_HUMANS !== "0") new SeedHumans(store)
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
// Idempotent on restart: Attendee.create overwrites the profile and Event.join upserts by id,
// so re-seeding never duplicates roster entries.
for (const p of seed) {
  try {
    await store.createAttendee(p)
    await store.joinEvent(p)
  } catch (e) { console.error(`[seed] ${p.id} failed`, e) }
}
{
  const roster = (await store.eventView()).roster
  const dupes = roster.length - new Set(roster.map((r) => r.id)).size
  console.log(`[seed] roster ${roster.length} (${dupes ? `${dupes} DUPLICATES` : "no duplicates"})`)
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

// ---------- fresh faces ----------
// Intros and match summaries keep a copy of each public profile from when they were made (old ones have no
// avatar). Before serving, swap in the current public profile so avatar and bio changes show everywhere.
const pubCache = new Map<string, { at: number; p: ReturnType<typeof toPublic> | null }>()
async function currentPublic(id: string) {
  const hit = pubCache.get(id)
  if (hit && Date.now() - hit.at < 3000) return hit.p
  const full = await store.getProfile(id).catch(() => null)
  const p = full ? toPublic(full) : null
  pubCache.set(id, { at: Date.now(), p })
  return p
}
async function freshIntro<T extends { a: string; b: string; profiles: Record<string, any> } | null>(s: T): Promise<T> {
  if (!s) return s
  const [pa, pb] = await Promise.all([currentPublic(s.a), currentPublic(s.b)])
  return { ...s, profiles: { ...s.profiles, ...(pa ? { [s.a]: pa } : {}), ...(pb ? { [s.b]: pb } : {}) } }
}
async function freshView<T extends { matches: { other: { id: string } }[] }>(v: T): Promise<T> {
  const matches = await Promise.all(v.matches.map(async (m) => {
    const p = await currentPublic(m.other.id)
    return p ? { ...m, other: p } : m
  }))
  return { ...v, matches } as T
}

// ---------- SSE ----------
interface Sub { attendee: string | null; send: (p: ServerPush) => void }
const subs = new Set<Sub>()
store.onChange((push) => {
  for (const s of subs) {
    if (push.type === "event") s.send(push)
    else if (push.type === "attendee" && push.id === s.attendee) {
      freshView(push.view).then((view) => s.send({ ...push, view })).catch(() => s.send(push))
    }
    // Intro changes (decide, chat, meet now) go to every stream of BOTH parties, redacted for that viewer.
    else if (push.type === "intro" && s.attendee && (push.state.a === s.attendee || push.state.b === s.attendee)) {
      const viewer = s.attendee
      freshIntro(push.state).catch(() => push.state).then((st) => s.send({ type: "intro", state: redactIntro(st, viewer) }))
    }
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
      write(`: ok\n\n`) // first bytes right away so proxies (Cloudflare tunnel) open the stream
      write(`retry: 2000\n\n`)
      sub.send({ type: "event", view: await store.eventView() })
      if (attendee) {
        const view = await freshView(await store.attendeeView(attendee))
        sub.send({ type: "attendee", id: attendee, view })
        for (const m of view.matches) {
          const s = await freshIntro(await store.intro(m.introId))
          if (s) sub.send({ type: "intro", state: redactIntro(s, attendee) })
        }
      }
    },
    cancel() { subs.delete(sub); clearInterval(ping) },
  })
  return new Response(stream, {
    headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", connection: "keep-alive" },
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

// ---------- events today (Partiful-style flow, docs/architecture.md) ----------
const LIVE_EVENT_ID = process.env.EVENT_ID || EVENT_ID
const EVENTS = [
  { id: LIVE_EVENT_ID, name: EVENT_NAME, when: "Today, 11:00 to 21:00", where: "YC, San Francisco", blurb: "Agents work the room while you build. Real-time AI hackathon, Halloween edition.", live: true },
  { id: "sf-ai-tinkerers", name: "AI Tinkerers SF: Agents Demo Night", when: "Today, 18:30", where: "SoMa, San Francisco", blurb: "Ten-minute demos of agent stacks, no slides.", live: false },
  { id: "sf-founders-coffee", name: "Founders and Funders Coffee", when: "Today, 08:30", where: "Hayes Valley, San Francisco", blurb: "Early-stage founders meet pre-seed and seed investors.", live: false },
  { id: "sf-infra-meetup", name: "Inference Infra Meetup", when: "Today, 19:00", where: "Mission Bay, San Francisco", blurb: "GPUs, serving and latency budgets, with pizza.", live: false },
  { id: "sf-design-ai", name: "Design x AI Mixer", when: "Today, 20:00", where: "Mission, San Francisco", blurb: "Designers and engineers building AI-native products.", live: false },
]

const roleIds = new Set(ROLES.map((r) => r.id))

function parseAttendance(v: unknown): Attendance {
  const attendance = String(v ?? "onsite") as Attendance
  if (attendance !== "onsite" && attendance !== "agent-only") throw new HttpError(400, "attendance must be onsite or agent-only")
  return attendance
}

/** Joins the live Event actor. Idempotent: Event.join upserts by id. */
async function joinLive(p: Profile) {
  if ("ensureAgent" in engine.transport && engine.transport.ensureAgent) {
    await engine.transport.ensureAgent(p).catch((e) => console.error(`[relay] ensureAgent ${p.id} failed`, e))
  }
  await store.joinEvent(p)
}

/** Sign up once: creates the attendee only. `join: true` keeps the old one-step flow (sign up + join live event). */
async function signup(req: Request) {
  const b = await body(req)
  const name = String(b.name ?? "").trim().slice(0, 60)
  const goal = String(b.goal ?? "").trim().slice(0, 280)
  const role = String(b.role ?? "other") as Role
  if (!name || !goal) throw new HttpError(400, "name and goal are required")
  if (!roleIds.has(role)) throw new HttpError(400, `role must be one of ${[...roleIds].join(", ")}`)
  const attendance = parseAttendance(b.attendance)
  const avatar = AVATAR_IDS.find((a) => a === b.avatar)
  const agentName = String(b.agentName ?? "").trim().slice(0, 40) || `${name.split(" ")[0]}'s agent`
  const id = `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`
  const p: Profile = {
    id, name, agentName, role,
    bio: String(b.bio ?? "").trim().slice(0, 200),
    shareableGoal: goal,
    attendance,
    ...(avatar ? { avatar } : {}),
    privateIntent: String(b.privateIntent ?? "").trim().slice(0, 500),
    contact: String(b.contact ?? "").trim().slice(0, 120) || `Find ${name} at ${EVENT_NAME}`,
  }
  await store.createAttendee(p)
  const joined = b.join === true || (typeof b.eventId === "string" && (b.eventId === LIVE_EVENT_ID || b.eventId === EVENT_ID))
  if (joined) await joinLive(p)
  console.log(`[signup] ${name} (${role}) -> ${id}${joined ? " (joined)" : ""}`)
  return json({ attendeeId: id, joined })
}

async function listEvents(attendee: string | null) {
  const roster = attendee ? (await store.eventView()).roster : []
  const inLive = !!attendee && roster.some((r) => r.id === attendee)
  return EVENTS.map((e) => ({ ...e, ...(attendee ? { joined: e.live && inLive } : {}) }))
}

async function joinEventRoute(eventId: string, req: Request) {
  const b = await body(req)
  // The live event answers to the server's EVENT_ID and to the plain "haunted-hacks" alias.
  const ev = eventId === EVENT_ID ? EVENTS[0] : EVENTS.find((e) => e.id === eventId)
  if (!ev) throw new HttpError(404, "event not found")
  if (!ev.live) throw new HttpError(409, "this event is not live yet")
  const attendeeId = String(b.attendeeId ?? "")
  const p = attendeeId ? await store.getProfile(attendeeId) : null
  if (!p) throw new HttpError(404, "attendee not found")
  if (b.attendance !== undefined) {
    const attendance = parseAttendance(b.attendance)
    if (attendance !== p.attendance) {
      p.attendance = attendance
      await store.createAttendee(p) // overwrites the profile; matches and conversations stay
    }
  }
  await joinLive(p)
  console.log(`[join] ${p.name} -> ${ev.id}`)
  return json({ ok: true, eventId: ev.id, attendeeId: p.id, joined: true })
}

/** Contacts only leave the server once both sides chose Connect, and only to the two of them.
 *  The other side's Pass is never shown (silent decline): maskIntro turns it into null / "pending". */
function redactIntro(s: any, as: string | null) {
  if (!s) return s
  const out = structuredClone(maskIntro(s, as))
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
        return json({ ok: true, store: storeKind, transport: engine.transport.name, transportStatus, relay: relayStatsRef, llm: llmProvider(), llmStats, speed: speed(), meetNowTtlMs: meetNowTtl() })
      }
      if (req.method === "GET" && path === "/api/observer") return json({ url: relayRef?.observerUrl ?? null })
      if (req.method === "POST" && path === "/api/signup") return await signup(req)
      if (req.method === "GET" && path === "/api/events") return json(await listEvents(url.searchParams.get("attendee")))
      if (req.method === "POST" && (r = m(/^\/api\/events\/([^/]+)\/join$/))) return await joinEventRoute(decodeURIComponent(r[1]), req)
      if (req.method === "GET" && (r = m(/^\/api\/attendee\/([^/]+)$/))) {
        const view = await store.attendeeView(r[1])
        return view.profile ? json(await freshView(view)) : json({ error: "attendee not found" }, 404)
      }
      if (req.method === "GET" && path === "/api/event") return json(await store.eventView())
      if (req.method === "GET" && path === "/api/stream") return sse(url.searchParams.get("attendee"), req)
      if (req.method === "GET" && (r = m(/^\/api\/intro\/([^/]+)$/))) {
        const s = await freshIntro(await store.intro(r[1]))
        return s ? json(redactIntro(s, url.searchParams.get("as"))) : json({ error: "intro not found" }, 404)
      }
      if (req.method === "POST" && (r = m(/^\/api\/intro\/([^/]+)\/decide$/))) {
        const b = await body(req)
        const choice = b.choice as Choice
        if (choice !== "connect" && choice !== "pass") throw new HttpError(400, "choice must be connect or pass")
        return json(redactIntro(await freshIntro(await store.decide(r[1], String(b.attendeeId), choice)), String(b.attendeeId)))
      }
      if (req.method === "POST" && (r = m(/^\/api\/intro\/([^/]+)\/chat$/))) {
        const b = await body(req)
        return json(redactIntro(await freshIntro(await store.chat(r[1], String(b.attendeeId), String(b.text ?? ""))), String(b.attendeeId)))
      }
      if (req.method === "POST" && (r = m(/^\/api\/intro\/([^/]+)\/meet$/))) {
        const b = await body(req)
        const action = String(b.action ?? "request") as MeetAction
        if (!["request", "accept", "decline", "arrive"].includes(action)) throw new HttpError(400, "action must be request, accept, decline or arrive")
        return json(redactIntro(await freshIntro(await store.meet(r[1], String(b.attendeeId), action)), String(b.attendeeId)))
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
