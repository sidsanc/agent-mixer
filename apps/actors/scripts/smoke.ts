// Smoke test for the actors. Needs `terse actor dev` running (apps/actors) and a generated client in
// apps/server/src/generated. Run: bun apps/actors/scripts/smoke.ts
// Uses a unique event id per run so state from earlier runs does not interfere.
import { actors } from "../../server/src/generated/index.js"
import type { IntroState, Profile } from "../src/types"

const run = Date.now().toString(36)
const EVENT = `smoke-${run}`
const ok = (cond: unknown, msg: string) => {
  if (!cond) { console.error("FAIL:", msg); process.exit(1) }
  console.log("ok  ", msg)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const people: Profile[] = [
  { id: `h-${run}`, name: "Ada", agentName: "Ada's agent", role: "founder", bio: "AI infra founder", shareableGoal: "Find a seed investor", privateIntent: "Raising $2M in Q1", contact: "ada@example.com" },
  { id: `s1-${run}`, name: "Vic", agentName: "Vic's agent", role: "investor", bio: "Seed VC", shareableGoal: "Meet AI infra founders", privateIntent: "Has 2 checks left this year", contact: "vic@example.com", seeded: true, plantedFor: ["founder"] },
  { id: `s2-${run}`, name: "Eve", agentName: "Eve's agent", role: "engineer", bio: "Rust engineer", shareableGoal: "Find a team", privateIntent: "Leaving job in March", contact: "eve@example.com", seeded: true },
]

const event = actors.Event.get(EVENT)
await event.configure({ maxParallel: 3, tickMs: 1000 })
for (const p of people) {
  await actors.Attendee.get(p.id).create(p)
  const { privateIntent: _pi, contact: _c, plantedFor, ...pub } = p
  await event.join(pub, plantedFor ?? [])
}
const ada = await actors.Attendee.get(people[0]!.id).view()
ok(ada.profile?.name === "Ada" && !("privateIntent" in (ada.profile as object)), "attendee view has public profile only")
const full = await actors.Attendee.get(people[0]!.id).getProfile()
ok(full?.privateIntent === "Raising $2M in Q1", "getProfile returns private fields")

// Wait for the alarm to pair.
let claimed: Awaited<ReturnType<typeof event.claimPending>> = []
for (let i = 0; i < 20 && claimed.length < 3; i++) {
  await sleep(500)
  claimed = [...claimed, ...(await event.claimPending())]
}
console.log("     paired:", claimed.map((c) => c.id).join(", "))
ok(claimed.length === 3, "alarm paired all 3 possible pairs")
ok(claimed[0]!.a === people[0]!.id && claimed[0]!.b === people[1]!.id, "human paired with planted partner first, human initiates")
const keys = claimed.map((c) => [c.a, c.b].sort().join("|"))
ok(new Set(keys).size === keys.length, "no duplicate pairs")

const conv = claimed[0]!
await Promise.all([actors.Attendee.get(conv.a).startConversation(conv), actors.Attendee.get(conv.b).startConversation(conv)])
for (let n = 0; n < 4; n++) {
  const from = n % 2 ? conv.b : conv.a
  const line = { id: `l${n}`, from, text: `line ${n}`, at: Date.now() }
  await Promise.all([
    actors.Attendee.get(conv.a).appendLine(conv.id, conv.a, conv.b, line),
    actors.Attendee.get(conv.b).appendLine(conv.id, conv.a, conv.b, line),
    event.addLine(conv.id, conv.a, conv.b, line),
  ])
}
// Retry of the same line is idempotent.
await actors.Attendee.get(conv.a).appendLine(conv.id, conv.a, conv.b, { id: "l3", from: conv.b, text: "line 3", at: Date.now() })
const va = await actors.Attendee.get(conv.a).view()
ok(va.conversations[0]?.lines.length === 4, "4 lines on attendee, duplicate line ignored")
let ev = await event.view()
ok(ev.feed.length === 4 && ev.feed[0]!.to === conv.b, "event feed has lines with recipient")
ok(ev.active.length === 3, "3 active conversations")

// Match.
const iid = `i-${[conv.a, conv.b].sort().join("-")}`
const base: IntroState = {
  id: iid, a: conv.a, b: conv.b,
  profiles: {}, why: "Investor fits founder", offers: { [conv.a]: "deal", [conv.b]: "check" },
  summary: "Good fit", opener: "Ask about the Q1 round", choices: {}, status: "pending",
  meeting: null, meetNow: null, chat: [], createdAt: Date.now(),
}
const intro = actors.Intro.get(iid)
await intro.create(base, { [conv.a]: "ada@example.com", [conv.b]: "vic@example.com" }, "The coffee table by the stage")
await intro.create({ ...base, why: "changed" }, {}, "x") // idempotent
ok((await intro.get())?.why === "Investor fits founder", "intro create is idempotent")
await Promise.all([
  actors.Attendee.get(conv.a).endConversation(conv.id, "matched", iid),
  actors.Attendee.get(conv.b).endConversation(conv.id, "matched", iid),
  event.endConversation(conv.id, "matched", iid),
])
ev = await event.view()
ok(ev.matchCount === 1 && ev.active.length === 2, "matchCount 1, slot freed")

let s = await intro.decide(conv.a, "connect")
ok(s.status === "pending" && s.meeting === null, "one-sided connect releases nothing")
s = await intro.decide(conv.a, "connect")
ok(s.status === "pending", "double tap is a no-op")
// Race: both sides tap Connect at the same instant, twice each.
const results = await Promise.all([intro.decide(conv.b, "connect"), intro.decide(conv.b, "connect"), intro.decide(conv.a, "connect")])
s = results[0]!
ok(s.status === "connected" && s.meeting?.contacts[conv.a] === "ada@example.com", "mutual connect sets meeting with contacts")
ok((await intro.meetingCount()) === 1, "meeting set exactly once")
await event.recordConnected(iid); await event.recordConnected(iid)
ok((await event.view()).connectedCount === 1, "connectedCount idempotent")

s = await intro.chat(conv.a, "See you at the stage?")
ok(s.chat.length === 1, "chat works after connect")
s = await intro.meet(conv.a, "request")
s = await intro.meet(conv.b, "accept")
ok(s.meetNow?.accepted === true, "meet now accepted")

let threw = false
try { await intro.decide("stranger", "connect") } catch { threw = true }
ok(threw, "stranger cannot decide")

// Stop a conversation.
const other = claimed[1]!
const pair = await event.stopConversation(other.id, other.a)
ok(pair?.a === other.a && (await event.isStopped(other.id)), "stopConversation works")
// Slot cap + lease expiry + refill on a second event with 6 attendees (15 possible pairs).
const ev2 = actors.Event.get(`${EVENT}-lease`)
await ev2.configure({ maxParallel: 3, tickMs: 500, leaseMs: 1500, seedChatter: true })
for (let i = 0; i < 6; i++) {
  await ev2.join({ id: `p${i}-${run}`, name: `P${i}`, agentName: `P${i}'s agent`, role: "engineer", bio: "", shareableGoal: "", seeded: i > 0 })
}
await sleep(1500)
const batch1 = await ev2.claimPending()
const load = new Map<string, number>()
for (const c of batch1) for (const id of [c.a, c.b]) load.set(id, (load.get(id) ?? 0) + 1)
ok(batch1.length > 0 && Math.max(...load.values()) <= 3, `first batch ${batch1.length} pairs, max load ${Math.max(...load.values())} <= 3`)
await sleep(3000) // leases (1.5s) expire on the alarm, slots refill
const v2 = await ev2.view()
ok(!v2.active.some((x) => batch1.some((c) => c.id === x.id)), "expired leases freed their slots")
const batch2 = await ev2.claimPending()
const all = [...batch1, ...batch2].map((c) => [c.a, c.b].sort().join("|"))
ok(batch2.length > 0 && new Set(all).size === all.length, `refill opened ${batch2.length} new pairs, never a repeat`)

console.log("\nALL PASS")
process.exit(0)
