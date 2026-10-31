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

export interface Backend {
  mode: "live" | "mock"
  signup(b: SignupBody): Promise<{ attendeeId: string }>
  attendee(id: string): Promise<AttendeeView>
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
