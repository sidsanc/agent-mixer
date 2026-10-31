import type {
  AttendeeView,
  Choice,
  EventView,
  Attendance,
  AvatarId,
  IntroState,
  MeetAction,
  Role,
  ServerPush,
} from "@agent-mixer/shared"

export interface SignupBody {
  name: string
  /** Defaults to "{name}'s agent". */
  agentName?: string
  role: Role
  goal: string
  bio?: string
  /** Private: the agent uses it to decide, never shares it. */
  privateIntent?: string
  attendance?: Attendance
  /** Private until both Connect: how the other person can spot you. */
  contact?: string
  avatar?: AvatarId
}

/** One card on "Events today". Only live events can be joined. */
export interface EventListing {
  id: string
  name: string
  when: string
  where: string
  blurb: string
  live: boolean
  joined?: boolean
}

export const LIVE_EVENT_ID = "haunted-hacks"

/** Shown when the server has no /api/events yet. */
export const FALLBACK_EVENTS: EventListing[] = [
  { id: LIVE_EVENT_ID, name: "Haunted Hacks: Real-Time AI Edition", when: "Today · 11:00 – 20:00", where: "Y Combinator, San Francisco", blurb: "A Halloween hackathon for real-time AI. Your agent works the room while you build.", live: true },
  { id: "founder-mixer", name: "Founders & Funders After Dark", when: "Tonight · 21:00", where: "Mission District, SF", blurb: "Pre-seed founders meet the angels who write first checks.", live: false },
  { id: "design-salon", name: "Design Engineers Salon", when: "Tomorrow · 18:30", where: "SoMa, SF", blurb: "People who design in code, comparing notes on agent UX.", live: false },
  { id: "voice-ai-night", name: "Voice AI Demo Night", when: "Sun · 19:00", where: "Palo Alto", blurb: "Ten live voice agent demos, then drinks.", live: false },
]

export interface Backend {
  mode: "live" | "mock"
  signup(b: SignupBody): Promise<{ attendeeId: string }>
  attendee(id: string): Promise<AttendeeView>
  events(attendeeId: string | null): Promise<EventListing[]>
  join(eventId: string, attendeeId: string, attendance: Attendance): Promise<{ ok: boolean }>
  event(): Promise<EventView>
  intro(id: string, as: string): Promise<IntroState>
  decide(id: string, attendeeId: string, choice: Choice): Promise<IntroState>
  chat(id: string, attendeeId: string, text: string): Promise<IntroState>
  meet(id: string, attendeeId: string, action: MeetAction): Promise<IntroState>
  endConversation(conversationId: string, attendeeId: string): Promise<{ ok: boolean }>
  /** Live pushes. Returns an unsubscribe function. */
  subscribe(attendeeId: string | null, onPush: (p: ServerPush) => void, onStatus?: (ok: boolean) => void): () => void
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${text || res.statusText}`)
  }
  return res.json() as Promise<T>
}

const post = <T,>(path: string, body: unknown) => json<T>(path, { method: "POST", body: JSON.stringify(body) })
const enc = encodeURIComponent

export const liveBackend: Backend = {
  mode: "live",
  signup: (b) => post("/api/signup", b),
  attendee: (id) => json(`/api/attendee/${enc(id)}`),
  async events(attendeeId) {
    try {
      const list = await json<EventListing[] | { events: EventListing[] }>(`/api/events${attendeeId ? `?attendee=${enc(attendeeId)}` : ""}`)
      const arr = Array.isArray(list) ? list : list.events
      return arr?.length ? arr : FALLBACK_EVENTS
    } catch {
      return FALLBACK_EVENTS
    }
  },
  async join(eventId, attendeeId, attendance) {
    try {
      return await post<{ ok: boolean }>(`/api/events/${enc(eventId)}/join`, { attendeeId, attendance })
    } catch (e) {
      // Older server: sign-up already joined the one event.
      if (String(e).includes("404")) return { ok: true }
      throw e
    }
  },
  event: () => json("/api/event"),
  intro: (id, as) => json(`/api/intro/${enc(id)}?as=${enc(as)}`),
  decide: (id, attendeeId, choice) => post(`/api/intro/${enc(id)}/decide`, { attendeeId, choice }),
  chat: (id, attendeeId, text) => post(`/api/intro/${enc(id)}/chat`, { attendeeId, text }),
  meet: (id, attendeeId, action) => post(`/api/intro/${enc(id)}/meet`, { attendeeId, action }),
  endConversation: (cid, attendeeId) => post(`/api/conversation/${enc(cid)}/end`, { attendeeId }),
  subscribe(attendeeId, onPush, onStatus) {
    let es: EventSource | null = null
    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null
    const open = () => {
      if (closed) return
      const url = attendeeId ? `/api/stream?attendee=${enc(attendeeId)}` : "/api/stream"
      es = new EventSource(url)
      es.onopen = () => onStatus?.(true)
      es.onmessage = (ev) => {
        try {
          onPush(JSON.parse(ev.data) as ServerPush)
        } catch {
          /* ignore keepalives */
        }
      }
      // Also accept named events, in case the server tags them by type.
      for (const t of ["attendee", "event", "intro"]) {
        es.addEventListener(t, (ev) => {
          try {
            onPush(JSON.parse((ev as MessageEvent).data) as ServerPush)
          } catch {
            /* ignore */
          }
        })
      }
      es.onerror = () => {
        onStatus?.(false)
        if (es?.readyState === EventSource.CLOSED) {
          es.close()
          retry = setTimeout(open, 2000)
        }
      }
    }
    open()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      es?.close()
    }
  },
}

/** True when the real server answers. */
export async function serverIsUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch("/api/event", { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) return false
    const ct = res.headers.get("content-type") ?? ""
    return ct.includes("json")
  } catch {
    return false
  }
}

export function forcedMock(): boolean {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get("mock") === "1") localStorage.setItem("am.forceMock", "1")
    if (q.get("mock") === "0") localStorage.removeItem("am.forceMock")
    return localStorage.getItem("am.forceMock") === "1"
  } catch {
    return false
  }
}

const KEY = "am.attendeeId"
export const myId = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  },
  set(id: string) {
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  },
}

/** Events this phone has joined, and how (onsite / agent-only). */
const JKEY = "am.joined"
export const joined = {
  all(): Record<string, Attendance> {
    try {
      return JSON.parse(localStorage.getItem(JKEY) ?? "{}")
    } catch {
      return {}
    }
  },
  set(eventId: string, a: Attendance) {
    try {
      localStorage.setItem(JKEY, JSON.stringify({ ...joined.all(), [eventId]: a }))
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      localStorage.removeItem(JKEY)
    } catch {
      /* ignore */
    }
  },
}
