// End-to-end API test for Agent Mixer. Run: `bun run test:e2e` (BASE_URL defaults to http://localhost:3001).
// Talks only to the public HTTP API + SSE, so it works against either store and does not depend on the UI.
// Prints PASS/FAIL per step; exits non-zero on the first failure.
import type { AttendeeView, IntroState, ServerPush } from "../packages/shared/src/index"

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "")
const CONV_MS = Number(process.env.E2E_CONV_MS ?? 10_000)
const MATCH_MS = Number(process.env.E2E_MATCH_MS ?? 45_000)

const nonce = () => Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "q")
// Unique words per run so this run's investor and founder outrank people left over from earlier runs.
const tag = Array.from({ length: 5 }, () => `zz${nonce()}`).join(" ")
const run = nonce()

let failed = false
const t0 = Date.now()
function report(ok: boolean, step: string, detail = "") {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(5)
  console.log(`${ok ? "PASS" : "FAIL"} [${s}s] ${step}${detail ? ` - ${detail}` : ""}`)
  if (!ok) failed = true
  return ok
}
function must(ok: boolean, step: string, detail = "") {
  if (!report(ok, step, detail)) finish()
}
function finish(): never {
  for (const s of streams) s.close()
  console.log(failed ? "\nE2E FAILED" : "\nE2E PASSED")
  process.exit(failed ? 1 : 0)
}

async function api<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any = text
  try { data = JSON.parse(text) } catch {}
  return { status: res.status, data }
}

async function waitFor<T>(what: () => Promise<T | null | undefined | false>, ms: number, every = 500): Promise<T | null> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await what().catch(() => null)
    if (v) return v
    await Bun.sleep(every)
  }
  return null
}

// ---------- SSE ----------
class Stream {
  pushes: ServerPush[] = []
  private ctrl = new AbortController()
  constructor(public attendee: string) {
    this.read().catch(() => {})
  }
  private async read() {
    const res = await fetch(`${BASE}/api/stream?attendee=${encodeURIComponent(this.attendee)}`, { signal: this.ctrl.signal })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ""
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i)
        buf = buf.slice(i + 2)
        for (const line of chunk.split("\n")) if (line.startsWith("data: ")) this.pushes.push(JSON.parse(line.slice(6)))
      }
    }
  }
  intros(id: string): IntroState[] {
    return this.pushes.flatMap((p) => (p.type === "intro" && p.state.id === id ? [p.state] : []))
  }
  close() { this.ctrl.abort() }
}
const streams: Stream[] = []
const stream = (id: string) => { const s = new Stream(id); streams.push(s); return s }

// ---------- people ----------
const investor = {
  name: `Ivy Investor ${run}`, role: "investor", bio: "Seed investor in developer tools.",
  goal: `Invest in a seed round for ${tag} developer tools`,
  privateIntent: `secretive fund mandate ${run} closing quietly next quarter`,
  contact: `ivy-${run}@example.test`,
}
const founder = {
  name: `Finn Founder ${run}`, role: "founder", bio: "Building developer tools.",
  goal: `Raise a seed round for ${tag} developer tools`,
  privateIntent: `runway worry ${run} only eight weeks of cash left`,
  contact: `finn-${run}@example.test`,
}
const third = {
  name: `Theo Third ${run}`, role: "engineer", bio: "Backend engineer.",
  goal: "Explore joining an early startup as a founding engineer.",
  contact: `theo-${run}@example.test`,
}

async function main() {
  console.log(`E2E against ${BASE} (run ${run})\n`)

  const health = await api("GET", "/api/health").catch((e) => ({ status: 0, data: String(e) }))
  must(health.status === 200, "server health", `store=${health.data?.store} transport=${health.data?.transport} llm=${health.data?.llm}`)

  const unknown = await api("GET", `/api/attendee/does-not-exist-${run}`)
  report(unknown.status === 404, "unknown attendee is 404", `got ${unknown.status}`)

  const bad = await api("POST", "/api/signup", { name: "", goal: "" })
  report(bad.status === 400, "signup validation rejects empty name/goal", `got ${bad.status}`)

  // ---- sign up ----
  const [si, sf, st] = await Promise.all([investor, founder, third].map((p) => api("POST", "/api/signup", p)))
  must(si.status === 200 && !!si.data.attendeeId, "investor signs up", si.data.attendeeId)
  must(sf.status === 200 && !!sf.data.attendeeId, "founder signs up", sf.data.attendeeId)
  must(st.status === 200 && !!st.data.attendeeId, "third human signs up", st.data.attendeeId)
  const I = si.data.attendeeId as string, F = sf.data.attendeeId as string, T = st.data.attendeeId as string

  // Two SSE clients for the investor (every client must get intro updates), one for the founder.
  const sI1 = stream(I), sI2 = stream(I), sF = stream(F)

  const view = async (id: string) => (await api<AttendeeView>("GET", `/api/attendee/${id}`)).data
  must((await view(I)).profile?.id === I, "attendee view returns the profile")

  // ---- conversations ----
  for (const [who, id] of [["investor", I], ["founder", F]] as const) {
    const v = await waitFor(async () => { const v = await view(id); return v.conversations.length ? v : null }, CONV_MS)
    must(!!v, `${who} has a conversation within ${CONV_MS / 1000}s`, v ? `${v.conversations.length} conversation(s)` : "none")
  }
  const lines = await waitFor(async () => (await view(I)).conversations.some((c) => c.lines.length > 0), CONV_MS + 5000)
  report(!!lines, "agents are exchanging lines")

  // ---- match ----
  const findIntro = async () => (await view(I)).matches.find((m) => m.other.id === F)
  const mI = await waitFor(findIntro, MATCH_MS, 1000)
  must(!!mI, `investor gets a match card with the founder within ${MATCH_MS / 1000}s`, mI?.introId ?? "none")
  const introId = mI!.introId
  const mF = await waitFor(async () => (await view(F)).matches.find((m) => m.introId === introId), 5000)
  must(!!mF, "founder gets the same match card", mF ? `why: ${mF.why.slice(0, 60)}` : "")
  report(!!(mI!.why && mI!.opener && mI!.youOffer && mI!.theyOffer), "match card has why, offers and opener")

  // ---- privacy before connect ----
  const leakCheck = async (label: string) => {
    const blobs = [
      JSON.stringify(await view(I)), JSON.stringify(await view(F)), JSON.stringify(await view(T)),
      JSON.stringify((await api("GET", "/api/event")).data),
    ]
    const intents = [investor.privateIntent, founder.privateIntent]
    const leaked = blobs.some((b) => intents.some((p) => b.includes(p) || b.includes(p.split(" ").slice(0, 3).join(" "))))
    report(!leaked, `${label}: private intent never appears in any view`)
  }
  await leakCheck("before connect")
  const contactsVisible = (s: any) => !!s?.meeting && Object.values(s.meeting.contacts ?? {}).some(Boolean)

  // ---- one-sided connect ----
  const d1 = await api<IntroState>("POST", `/api/intro/${introId}/decide`, { attendeeId: I, choice: "connect" })
  must(d1.status === 200 && d1.data.status === "pending", "investor connects; intro still pending", `status=${d1.data?.status}`)
  const asF1 = (await api<IntroState>("GET", `/api/intro/${introId}?as=${F}`)).data
  const asI1 = (await api<IntroState>("GET", `/api/intro/${introId}?as=${I}`)).data
  const fView1 = JSON.stringify(await view(F))
  report(!contactsVisible(asF1) && !contactsVisible(asI1) && !fView1.includes(investor.contact) && !JSON.stringify(asF1).includes(investor.contact),
    "one-sided connect leaks no contact")
  const dup = await api<IntroState>("POST", `/api/intro/${introId}/decide`, { attendeeId: I, choice: "pass" })
  report(dup.data?.choices?.[I] === "connect", "double tap is a no-op", `choice=${dup.data?.choices?.[I]}`)
  const early = await api("POST", `/api/intro/${introId}/chat`, { attendeeId: I, text: "too early" })
  report(early.status === 409, "chat is closed before mutual connect", `got ${early.status}`)
  const stranger = await api("POST", `/api/intro/${introId}/decide`, { attendeeId: T, choice: "connect" })
  report(stranger.status === 403, "a third person cannot decide on the intro", `got ${stranger.status}`)

  // ---- mutual connect ----
  const d2 = await api<IntroState>("POST", `/api/intro/${introId}/decide`, { attendeeId: F, choice: "connect" })
  must(d2.status === 200 && d2.data.status === "connected", "founder connects; intro connected", `status=${d2.data?.status}`)
  const asI = (await api<IntroState>("GET", `/api/intro/${introId}?as=${I}`)).data
  const asF = (await api<IntroState>("GET", `/api/intro/${introId}?as=${F}`)).data
  const card = (s: IntroState) => JSON.stringify(s.meeting)
  must(!!asI.meeting && card(asI) === card(asF), "both sides see one identical meeting card", asI.meeting?.point)
  report(asI.meeting?.contacts?.[I] === investor.contact && asI.meeting?.contacts?.[F] === founder.contact,
    "meeting card carries both contacts")
  const again = await api<IntroState>("POST", `/api/intro/${introId}/decide`, { attendeeId: F, choice: "connect" })
  report(card(again.data) === card(asI), "repeat connect keeps the same meeting card")

  // Third human (not a party) sees no contacts and no chat.
  const asT = (await api<IntroState>("GET", `/api/intro/${introId}?as=${T}`)).data
  const anon = (await api<IntroState>("GET", `/api/intro/${introId}`)).data
  report(!contactsVisible(asT) && !contactsVisible(anon) && !JSON.stringify(asT).includes(investor.contact),
    "third person and anonymous readers see no contacts")
  report(!JSON.stringify(await view(T)).includes(investor.contact) && !JSON.stringify(await view(T)).includes(founder.contact),
    "third person's own view holds no contacts")

  // ---- chat both ways ----
  const c1 = await api<IntroState>("POST", `/api/intro/${introId}/chat`, { attendeeId: I, text: `hello from ivy ${run}` })
  const c2 = await api<IntroState>("POST", `/api/intro/${introId}/chat`, { attendeeId: F, text: `hi back from finn ${run}` })
  must(c1.status === 200 && c2.status === 200 && c2.data.chat.length >= 2, "chat both ways", `${c2.data?.chat?.length} messages`)
  report(c2.data.chat.at(-2)?.from === I && c2.data.chat.at(-1)?.from === F, "chat keeps order and authors")
  const sseChat = await waitFor(async () =>
    [sI1, sI2, sF].every((s) => s.intros(introId).some((x) => x.chat.some((l) => l.text === `hi back from finn ${run}`))), 5000, 250)
  report(!!sseChat, "chat is pushed over SSE to both parties (both investor clients too)")
  report(asT.chat.length === 0 && (await api<IntroState>("GET", `/api/intro/${introId}?as=${T}`)).data.chat.length === 0,
    "third person cannot read the chat")

  // ---- meet now ----
  const r1 = await api<IntroState>("POST", `/api/intro/${introId}/meet`, { attendeeId: I, action: "request" })
  must(r1.status === 200 && r1.data.meetNow?.requestedBy === I && r1.data.meetNow.accepted === false, "investor requests meet now")
  const sseReq = await waitFor(async () => sF.intros(introId).some((x) => x.meetNow?.requestedBy === I), 5000, 250)
  report(!!sseReq, "founder's SSE sees the meet-now request")
  const r2 = await api<IntroState>("POST", `/api/intro/${introId}/meet`, { attendeeId: F, action: "accept" })
  must(r2.status === 200 && r2.data.meetNow?.accepted === true, "founder accepts meet now")
  const sseAcc = await waitFor(async () => [sI1, sI2].every((s) => s.intros(introId).some((x) => x.meetNow?.accepted)), 5000, 250)
  report(!!sseAcc, "investor's SSE clients see the acceptance")
  const sseDecide = [sI1, sI2, sF].every((s) => s.intros(introId).some((x) => x.status === "connected"))
  report(sseDecide, "connect decision was pushed over SSE to both parties")
  const sseContacts = sF.intros(introId).filter((x) => x.status !== "connected").every((x) => !contactsVisible(x))
  report(sseContacts, "SSE never carried contacts before connect")

  // ---- end conversation ----
  const active = await waitFor(async () => {
    for (const id of [T, I, F]) {
      const c = (await view(id)).conversations.find((c) => c.status === "active")
      if (c) return { id, c }
    }
    return null
  }, 20_000, 1000)
  if (report(!!active, "found an active conversation to end", active?.c.id)) {
    const notMine = await api("POST", `/api/conversation/${active!.c.id}/end`, { attendeeId: `nobody-${run}` })
    report(notMine.status === 200 && (await view(active!.id)).conversations.find((c) => c.id === active!.c.id)?.status === "active",
      "a stranger cannot end someone else's conversation")
    const end = await api("POST", `/api/conversation/${active!.c.id}/end`, { attendeeId: active!.id })
    report(end.status === 200 && end.data.ok === true, "End conversation returns ok")
    const stopped = await waitFor(async () =>
      (await view(active!.id)).conversations.find((c) => c.id === active!.c.id)?.status === "stopped", 5000)
    report(!!stopped, "conversation shows as stopped")
    const n = (await view(active!.id)).conversations.find((c) => c.id === active!.c.id)?.lines.length ?? 0
    await Bun.sleep(6000)
    const n2 = (await view(active!.id)).conversations.find((c) => c.id === active!.c.id)?.lines.length ?? 0
    report(n2 === n, "no new lines after End", `${n} -> ${n2}`)
  }

  await leakCheck("at the end")
  const ev = (await api("GET", "/api/event")).data
  const ids = ev.roster.map((r: any) => r.id)
  report(ids.length === new Set(ids).size, "event roster has no duplicate entries", `${ids.length} people`)
  report(ev.matchCount >= 1 && ev.connectedCount >= 1, "event counters moved", `matches=${ev.matchCount} connected=${ev.connectedCount}`)

  finish()
}

main().catch((e) => { report(false, "unexpected error", e?.stack ?? String(e)); finish() })
