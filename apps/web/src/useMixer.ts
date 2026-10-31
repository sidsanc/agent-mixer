import { useCallback, useEffect, useRef, useState } from "react"
import type { AttendeeView, EventView, IntroState, PublicProfile, ServerPush } from "@agent-mixer/shared"
import { forcedMock, liveBackend, serverIsUp, type Backend } from "./backend"
import { mockBackend } from "./mock"

/** Picks live when /api answers, else mock; keeps checking so it flips to live automatically. */
export function useBackend(): Backend | null {
  const [backend, setBackend] = useState<Backend | null>(null)
  useEffect(() => {
    let alive = true
    const forced = forcedMock()
    const check = async () => {
      if (forced) return setBackend(mockBackend)
      const up = await serverIsUp()
      if (!alive) return
      setBackend((cur) => {
        if (up) return liveBackend
        // Keep using live through brief blips once we have it; SSE reconnects.
        return cur?.mode === "live" ? cur : mockBackend
      })
    }
    check()
    const t = setInterval(check, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return backend
}

export interface MixerState {
  backend: Backend | null
  connected: boolean
  attendee: AttendeeView | null
  event: EventView | null
  intros: Record<string, IntroState>
  notFound: boolean
  profileOf: (id: string) => PublicProfile | undefined
  refresh: () => void
  setIntro: (s: IntroState) => void
}

export function useMixer(attendeeId: string | null): MixerState {
  const backend = useBackend()
  const [attendee, setAttendee] = useState<AttendeeView | null>(null)
  const [event, setEvent] = useState<EventView | null>(null)
  const [intros, setIntros] = useState<Record<string, IntroState>>({})
  const [connected, setConnected] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const introsRef = useRef(intros)
  introsRef.current = intros

  const setIntro = useCallback((s: IntroState) => {
    setIntros((cur) => ({ ...cur, [s.id]: s }))
  }, [])

  const load = useCallback(async () => {
    if (!backend) return
    backend.event().then(setEvent).catch(() => {})
    if (attendeeId) {
      try {
        const v = await backend.attendee(attendeeId)
        setAttendee(v)
        setNotFound(!v.profile)
        // Fetch intro state for any match we have acted on or that is connected.
        for (const m of v.matches) {
          const known = introsRef.current[m.introId]
          if (m.status === "connected" || m.myChoice || !known) {
            backend.intro(m.introId, attendeeId).then(setIntro).catch(() => {})
          }
        }
      } catch (e) {
        if (String(e).startsWith("Error: 404")) setNotFound(true)
      }
    }
  }, [backend, attendeeId, setIntro])

  useEffect(() => {
    if (!backend) return
    setAttendee(null)
    setIntros({})
    load()
    const onPush = (p: ServerPush) => {
      if (p.type === "event") setEvent(p.view)
      else if (p.type === "attendee" && p.id === attendeeId) setAttendee(p.view)
      else if (p.type === "intro") setIntro(p.state)
    }
    const unsub = backend.subscribe(attendeeId, onPush, (ok) => {
      setConnected(ok)
      if (ok) load()
    })
    // Safety net in live mode: slow poll in case a push is missed.
    const poll = backend.mode === "live" ? setInterval(load, 6000) : null
    return () => {
      unsub()
      if (poll) clearInterval(poll)
    }
  }, [backend, attendeeId, load, setIntro])

  // When a new match shows up, fetch its intro state.
  useEffect(() => {
    if (!backend || !attendeeId || !attendee) return
    for (const m of attendee.matches) {
      const it = introsRef.current[m.introId]
      if (!it || (m.status === "connected" && !it.meeting)) {
        backend.intro(m.introId, attendeeId).then(setIntro).catch(() => {})
      }
    }
  }, [backend, attendeeId, attendee, setIntro])

  const profileOf = useCallback(
    (id: string) => {
      const fromRoster = event?.roster.find((r) => r.id === id)
      if (fromRoster) return fromRoster
      if (attendee?.profile?.id === id) return attendee.profile
      const m = attendee?.matches.find((x) => x.other.id === id)
      if (m) return m.other
      for (const it of Object.values(intros)) if (it.profiles[id]) return it.profiles[id]
      return undefined
    },
    [event, attendee, intros],
  )

  return { backend, connected, attendee, event, intros, notFound, profileOf, refresh: load, setIntro }
}
