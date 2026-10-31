// The animated venue ("Vice City Social" Agent World, from docs/design/vice-agent-world.html).
// One canvas, a rAF loop, and React props pushed into a ref each render.
import { useEffect, useRef } from "react"
import type { AvatarId } from "@agent-mixer/shared"

export interface WorldAgent {
  id: string
  name: string
  color: string // role accent for the name tag dot
  isMe?: boolean
  avatar?: AvatarId
}

export interface WorldBubble {
  key: string // line id; a new key re-pops the bubble
  speaker: string // agent id the bubble sits above
  label: string // "MAYA'S AGENT"
  text: string
}

interface Props {
  agents: WorldAgent[]
  /** Pairs currently talking: they meet at a free spot near the midpoint of their own spots, stand
   *  face to face and talk. On the phone, pass [] — my partners wait at their own spots and my agent visits `focus`. */
  pairs: [string, string][]
  /** Phone: the partner my agent walks toward. */
  focus?: string | null
  /** Phone: everyone my agent is talking with (they wait at a spot of their own). */
  partners?: string[]
  bubbles: WorldBubble[]
  variant: "phone" | "screen"
  className?: string
}

type Sim = {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  hx: number // home spot (fractions of width/height): where this guest stands when not talking
  hy: number
  walk: number
  dir: number
  phase: number
  sprite: number // -1 walk atlas (Shimo), -2 robot token, 1..3 character sheet column
  tint: boolean // man2: the floral-shirt man, shirt recoloured blue
  bornAt: number
  partner: string | null // who this agent is talking with right now
  settled: boolean // standing at the talk spot (no sliding while talking)
  face: number // 1 = facing right, -1 = facing left
  turnAt: number // next idle glance the other way
}

type Frame = { sx: number; sy: number; sw: number; sh: number; ax: number; ay: number }

const VENUE = "/art/venue.jpg"
const SPRITES = "/art/sprites.png"
const WALK = "/art/walk.png"
const PORTRAITS = "/art/portraits.png"

/** Character sheet column (or special) for a picked avatar; missing = hashed like before. */
function spriteFor(a: WorldAgent): { sprite: number; tint: boolean } {
  switch (a.avatar) {
    case "man1":
      return { sprite: 2, tint: false }
    case "man2":
      return { sprite: 2, tint: true }
    case "woman1":
      return { sprite: 1, tint: false }
    case "woman2":
      return { sprite: 3, tint: false }
    case "robot":
      return { sprite: -2, tint: false }
  }
  return { sprite: a.isMe ? -1 : 1 + (hash(a.id) % 3), tint: false }
}

/** A copy of the character sheet with the man's purple shirt turned blue (pixel pass; canvas
 *  `filter` is missing on older iOS Safari and would also tint his skin). */
function tintedSheet(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas")
  const w = img.naturalWidth
  const h = img.naturalHeight
  c.width = w
  c.height = h
  const cx = c.getContext("2d", { willReadFrequently: true })!
  cx.drawImage(img, 0, 0)
  const x0 = Math.round(w / 2)
  const x1 = Math.round((w * 3) / 4)
  const d = cx.getImageData(x0, 0, x1 - x0, h)
  const px = d.data
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const c0 = mx - mn
    if (c0 < 0.08 || mx === 0) continue
    let hue = mx === r ? ((g - b) / c0) % 6 : mx === g ? (b - r) / c0 + 2 : (r - g) / c0 + 4
    hue *= 60
    if (hue < 0) hue += 360
    // Magenta/purple only (the shirt and its print); skin and trousers stay.
    if (hue < 255 || hue > 350) continue
    const nh = (hue - 95 + 360) % 360
    const l = (mx + mn) / 2
    const sat = c0 / (1 - Math.abs(2 * l - 1) || 1)
    const C = (1 - Math.abs(2 * l - 1)) * sat
    const X = C * (1 - Math.abs(((nh / 60) % 2) - 1))
    const m = l - C / 2
    const [rr, gg, bb] = nh < 60 ? [C, X, 0] : nh < 120 ? [X, C, 0] : nh < 180 ? [0, C, X] : nh < 240 ? [0, X, C] : nh < 300 ? [X, 0, C] : [C, 0, X]
    px[i] = (rr + m) * 255
    px[i + 1] = (gg + m) * 255
    px[i + 2] = (bb + m) * 255
  }
  cx.putImageData(d, x0, 0)
  return c
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function loadImg(src: string) {
  const i = new Image()
  i.src = src
  return i
}

/** Crop each cell of a 4x4 walk atlas to its opaque pixels and find the foot anchor. */
function walkFrames(img: HTMLImageElement): Frame[][] {
  const c = document.createElement("canvas")
  const w = img.naturalWidth
  const h = img.naturalHeight
  c.width = w
  c.height = h
  const cx = c.getContext("2d", { willReadFrequently: true })!
  cx.drawImage(img, 0, 0)
  const px = cx.getImageData(0, 0, w, h).data
  const out: Frame[][] = []
  for (let row = 0; row < 4; row++) {
    out[row] = []
    for (let col = 0; col < 4; col++) {
      const sx = Math.round((col * w) / 4)
      const ex = Math.round(((col + 1) * w) / 4)
      const sy = Math.round((row * h) / 4)
      const ey = Math.round(((row + 1) * h) / 4)
      let minX = ex,
        minY = ey,
        maxX = sx,
        maxY = sy
      for (let y = sy; y < ey; y++)
        for (let x = sx; x < ex; x++)
          if (px[(y * w + x) * 4 + 3] > 96) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
      if (maxX < minX) {
        minX = sx
        maxX = ex - 1
        minY = sy
        maxY = ey - 1
      }
      out[row][col] = { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1, ax: (maxX - minX) / 2, ay: maxY - minY + 1 }
    }
  }
  return out
}

/** Crop each of the 4 columns of the character sheet to its opaque bounds. */
function spriteFrames(img: HTMLImageElement): Frame[] {
  const c = document.createElement("canvas")
  const w = img.naturalWidth
  const h = img.naturalHeight
  c.width = w
  c.height = h
  const cx = c.getContext("2d", { willReadFrequently: true })!
  cx.drawImage(img, 0, 0)
  const px = cx.getImageData(0, 0, w, h).data
  const out: Frame[] = []
  for (let col = 0; col < 4; col++) {
    const sx = Math.round((col * w) / 4)
    const ex = Math.round(((col + 1) * w) / 4)
    let minX = ex,
      minY = h,
      maxX = sx,
      maxY = 0
    for (let y = 0; y < h; y += 2)
      for (let x = sx; x < ex; x += 2)
        if (px[(y * w + x) * 4 + 3] > 96) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
    out.push({ sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1, ax: (maxX - minX) / 2, ay: maxY - minY + 1 })
  }
  return out
}

export function VenueWorld({ agents, pairs, focus, partners = [], bubbles, variant, className = "" }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const props = useRef({ agents, pairs, focus, partners, bubbles, variant })
  props.current = { agents, pairs, focus, partners, bubbles, variant }

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext("2d")!
    const venue = loadImg(VENUE)
    const sprites = loadImg(SPRITES)
    const walk = loadImg(WALK)
    const portraits = loadImg(PORTRAITS)
    let wf: Frame[][] | null = null
    let sf: Frame[] | null = null
    let tinted: HTMLCanvasElement | null = null
    walk.onload = () => (wf = walkFrames(walk))
    sprites.onload = () => {
      sf = spriteFrames(sprites)
      try {
        tinted = tintedSheet(sprites)
      } catch {
        tinted = null
      }
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    const sims = new Map<string, Sim>()
    const bubbleBorn = new Map<string, number>()
    let W = 0,
      H = 0,
      raf = 0,
      last = 0,
      t = 0

    const resize = () => {
      const d = Math.min(devicePixelRatio || 1, 2)
      const r = cv.getBoundingClientRect()
      W = r.width
      H = r.height
      cv.width = Math.round(W * d)
      cv.height = Math.round(H * d)
      ctx.setTransform(d, 0, 0, d, 0, 0)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    resize()

    // Floor band where people can stand (fractions of width/height).
    const band = () => (props.current.variant === "phone" ? { y0: 0.5, y1: 0.8, x0: 0.1, x1: 0.9 } : { y0: 0.42, y1: 0.86, x0: 0.05, x1: 0.95 })
    const scaleAt = (y: number) => {
      const b = band()
      const u = clamp((y / H - b.y0) / (b.y1 - b.y0), 0, 1)
      const base = props.current.variant === "phone" ? H / 780 : H / 620
      return (0.62 + u * 0.55) * base
    }
    const MX = 0.035 // margin inside the band
    const MY = 0.03
    /** Keep a spot (fractions) on the floor, leaving `half` px either side for a pair. */
    const onFloor = (fx: number, fy: number, half = 0) => {
      const b = band()
      const hx = W ? half / W : 0
      return { fx: clamp(fx, b.x0 + MX + hx, b.x1 - MX - hx), fy: clamp(fy, b.y0 + MY, b.y1 - MY) }
    }
    // Vertical gaps count less: people are tall, so someone a little further back in the same
    // column is hidden behind the one in front (and so is their bubble). Prefer side-by-side spacing.
    const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, (ay - by) * 0.6)
    /** Where everyone else is standing or heading (px). */
    const taken = (ex: string[]) => {
      const out: { x: number; y: number }[] = []
      for (const [id, s] of sims) if (!ex.includes(id)) out.push({ x: s.tx, y: s.ty })
      return out
    }
    const clearance = (x: number, y: number, pts: { x: number; y: number }[]) => {
      let m = 1e4
      for (const p of pts) m = Math.min(m, dist(x, y, p.x, p.y))
      return m
    }
    /** Best-candidate sampling (Poisson-disk-like): the floor spot furthest from everyone else.
     *  `near` pulls it toward a point (a pair's midpoint); `half` reserves room for two people side by side. */
    function freeSpot(pts: { x: number; y: number }[], opts: { near?: { x: number; y: number }; radius?: number; pull?: number; half?: number } = {}) {
      const { near, radius = 0, pull = 0, half = 0 } = opts
      const b = band()
      let best = { fx: (b.x0 + b.x1) / 2, fy: (b.y0 + b.y1) / 2 }
      let bestScore = -Infinity
      for (let i = 0; i < 32; i++) {
        let c
        if (near) {
          const a = Math.random() * Math.PI * 2
          const r = i === 0 ? 0 : Math.sqrt(Math.random()) * radius
          c = onFloor((near.x + Math.cos(a) * r) / W, (near.y + Math.sin(a) * r * 0.5) / H, half)
        } else c = onFloor(b.x0 + Math.random() * (b.x1 - b.x0), b.y0 + Math.random() * (b.y1 - b.y0), half)
        const px = c.fx * W
        const py = c.fy * H
        const room = Math.min(clearance(px - half, py, pts), clearance(px + half, py, pts), 600)
        const score = room - (near ? pull * dist(px, py, near.x, near.y) : 0)
        if (score > bestScore) {
          bestScore = score
          best = c
        }
      }
      return best
    }
    /** Half the distance between two people talking: about one body-width between them. */
    const halfGap = (y: number) => 38 * scaleAt(y)
    /** A spot one conversation-width beside someone standing at (fx, fy): the side that stays on
     *  the floor (never squeezed onto them at the edge), then the side with more room. */
    const beside = (fx: number, fy: number, pts: { x: number; y: number }[]) => {
      const g = 2 * halfGap(fy * H)
      const sides = [-1, 1].map((d) => {
        const p = onFloor(fx + (d * g) / W, fy)
        const squeezed = Math.abs(p.fx - fx) * W < g * 0.9
        return { p, score: (squeezed ? -1e5 : 0) + clearance(p.fx * W, p.fy * H, pts) }
      })
      return sides[0].score >= sides[1].score ? sides[0].p : sides[1].p
    }

    // Big screen: which pairs are standing together right now. An agent shows one conversation
    // at a time; with several, it stays a few seconds, then walks to the next partner, who waits.
    type Engagement = { a: string; b: string; pos: Map<string, { fx: number; fy: number }>; settledAt: number }
    const engaged = new Map<string, Engagement>()
    const lastEngaged = new Map<string, number>()
    const DWELL = 6
    // Phone: where my agent stands beside the partner it is visiting.
    let visit: { id: string; fx: number; fy: number } | null = null
    let nextWander = 3

    /** Two side-by-side spots for a pair, facing each other. With a hub, the partner keeps its spot. */
    function pairSpots(a: string, b: string, hub: string | null) {
      const A = sims.get(a)!
      const B = sims.get(b)!
      const pts = taken([a, b])
      const pos = new Map<string, { fx: number; fy: number }>()
      if (hub) {
        const anchor = hub === a ? b : a
        const N = sims.get(anchor)!
        pos.set(anchor, { fx: N.hx, fy: N.hy })
        pos.set(hub, beside(N.hx, N.hy, pts))
        return pos
      }
      const mid = { x: (A.hx + B.hx) * 0.5 * W, y: (A.hy + B.hy) * 0.5 * H }
      const half = halfGap(mid.y)
      const c = freeSpot(pts, { near: mid, radius: W * 0.3, pull: 0.2, half })
      // Whoever is further left takes the left side, so nobody crosses over.
      const aLeft = A.x <= B.x
      pos.set(a, { fx: c.fx + ((aLeft ? -1 : 1) * half) / W, fy: c.fy })
      pos.set(b, { fx: c.fx + ((aLeft ? 1 : -1) * half) / W, fy: c.fy })
      return pos
    }

    const goTo = (s: Sim, x: number, y: number) => {
      if (Math.hypot(s.tx - x, s.ty - y) > 2) {
        s.tx = x
        s.ty = y
        s.settled = false
      }
    }

    function plan() {
      const { agents, pairs, focus, partners, variant } = props.current
      if (!W || !H) return
      const ids = new Set(agents.map((a) => a.id))
      for (const id of [...sims.keys()]) if (!ids.has(id)) sims.delete(id)
      const fresh = agents.filter((a) => !sims.has(a.id))
      // A crowd loading at once just appears in place; a single arrival walks in from the door.
      const bulk = fresh.length > 2 || t < 1.5
      for (const a of agents) {
        const look = spriteFor(a)
        const ex = sims.get(a.id)
        if (ex) {
          ex.sprite = look.sprite
          ex.tint = look.tint
          continue
        }
        const h = freeSpot(taken([]))
        const x = h.fx * W
        const y = h.fy * H
        sims.set(a.id, {
          x,
          y: bulk ? y : H * 0.98,
          vx: 0,
          vy: 0,
          tx: x,
          ty: y,
          hx: h.fx,
          hy: h.fy,
          walk: 0,
          dir: 2,
          phase: (hash(a.id) % 100) / 16,
          sprite: look.sprite,
          tint: look.tint,
          bornAt: t,
          partner: null,
          settled: bulk,
          face: hash(a.id) % 2 ? 1 : -1,
          turnAt: t + 2 + Math.random() * 6,
        })
      }

      const talking = new Map<string, { x: number; y: number; partner: string }>()
      if (variant === "screen") {
        const live = new Map<string, [string, string]>()
        const degree = new Map<string, number>()
        for (const [a, b] of pairs) {
          if (a === b || !sims.has(a) || !sims.has(b)) continue
          const key = [a, b].sort().join("|")
          if (live.has(key)) continue
          live.set(key, [a, b])
          degree.set(a, (degree.get(a) ?? 0) + 1)
          degree.set(b, (degree.get(b) ?? 0) + 1)
        }
        for (const k of [...engaged.keys()]) if (!live.has(k)) engaged.delete(k)
        const busy = () => {
          const s = new Set<string>()
          for (const e of engaged.values()) s.add(e.a).add(e.b)
          return s
        }
        // Turn over: after a few seconds together, move on if someone free is waiting for one of them.
        for (const [key, e] of [...engaged]) {
          if (!e.settledAt || t - e.settledAt < DWELL) continue
          const b0 = busy()
          const waiting = [...live].some(([k, [x, y]]) => {
            if (engaged.has(k)) return false
            if (x === e.a || x === e.b) return !b0.has(y)
            if (y === e.a || y === e.b) return !b0.has(x)
            return false
          })
          if (waiting) {
            engaged.delete(key)
            lastEngaged.set(key, t)
          }
        }
        const b1 = busy()
        const queue = [...live].filter(([k]) => !engaged.has(k)).sort(([k1], [k2]) => (lastEngaged.get(k1) ?? -1) - (lastEngaged.get(k2) ?? -1))
        for (const [key, [a, b]] of queue) {
          if (b1.has(a) || b1.has(b)) continue
          const da = degree.get(a) ?? 1
          const db = degree.get(b) ?? 1
          const hub = da > 1 && db === 1 ? a : db > 1 && da === 1 ? b : null
          const pos = pairSpots(a, b, hub)
          engaged.set(key, { a, b, pos, settledAt: 0 })
          // Claim the spots now, so the next pair picked this tick keeps its distance.
          for (const [id, p] of pos) goTo(sims.get(id)!, p.fx * W, p.fy * H)
          b1.add(a).add(b)
        }
        for (const e of engaged.values()) {
          for (const id of [e.a, e.b]) {
            const p = e.pos.get(id)!
            talking.set(id, { x: p.fx * W, y: p.fy * H, partner: id === e.a ? e.b : e.a })
          }
          if (!e.settledAt && sims.get(e.a)?.settled && sims.get(e.b)?.settled) e.settledAt = t
        }
      } else {
        const me = agents.find((a) => a.isMe)
        const M = me ? sims.get(me.id) : null
        // My partners wait at their own spots, turned toward my agent; mine walks over to each in turn.
        for (const pid of partners) {
          const P = sims.get(pid)
          if (P && me) talking.set(pid, { x: P.hx * W, y: P.hy * H, partner: me.id })
        }
        if (me && M && focus && talking.has(focus)) {
          const F = sims.get(focus)!
          if (!visit || visit.id !== focus) visit = { id: focus, ...beside(F.hx, F.hy, taken([me.id, focus])) }
          talking.set(me.id, { x: visit.fx * W, y: visit.fy * H, partner: focus })
        } else visit = null
      }

      const n = sims.size
      const b = band()
      const ideal = Math.sqrt(((b.x1 - b.x0) * W * (b.y1 - b.y0) * H * 0.6) / Math.max(1, n))
      for (const [id, s] of sims) {
        const tk = talking.get(id)
        if (tk) {
          s.partner = tk.partner
          goTo(s, tk.x, tk.y)
          continue
        }
        if (s.partner) {
          // Conversation over: walk back to my spot, or a fresh one if a pair is now standing there.
          s.partner = null
          if (clearance(s.hx * W, s.hy * H, taken([id])) < ideal * 0.45) {
            const h = freeSpot(taken([id]))
            s.hx = h.fx
            s.hy = h.fy
          }
        }
        goTo(s, s.hx * W, s.hy * H)
      }

      // Now and then one idle guest (never a group) strolls to a new free spot.
      if (t > nextWander) {
        nextWander = t + (variant === "phone" ? 5 + Math.random() * 5 : 2.5 + Math.random() * 3)
        const roaming = [...sims.values()].filter((s) => !s.partner && !s.settled).length
        const idle = agents.filter((a) => !a.isMe && sims.get(a.id)?.settled && !sims.get(a.id)?.partner)
        if (idle.length && roaming < Math.max(1, Math.floor(n * 0.1))) {
          const id = idle[Math.floor(Math.random() * idle.length)].id
          const s = sims.get(id)!
          const h = freeSpot(taken([id]), { near: { x: s.x, y: s.y }, radius: W * 0.3, pull: 0.15 })
          s.hx = h.fx
          s.hy = h.fy
          goTo(s, h.fx * W, h.fy * H)
        }
      }
    }

    function step(dt: number) {
      const { agents } = props.current
      for (const a of agents) {
        const s = sims.get(a.id)
        if (!s) continue
        const dx = s.tx - s.x
        const dy = s.ty - s.y
        const d = Math.hypot(dx, dy)
        if (d < 3) {
          // Arrived: stand still (no sliding).
          s.x = s.tx
          s.y = s.ty
          s.vx = 0
          s.vy = 0
          s.settled = true
        } else {
          // Walking with purpose, at an even pace.
          s.settled = false
          const speed = (a.isMe ? 74 : 54) * (H / 700)
          const st = Math.min(speed * dt, d)
          s.vx = (dx / d) * speed
          s.vy = (dy / d) * speed
          s.x += (dx / d) * st
          s.y += (dy / d) * st
          s.walk += st * 0.1
        }
        const ax = Math.abs(s.vx),
          ay = Math.abs(s.vy)
        const P = s.partner ? sims.get(s.partner) : null
        if (!s.settled) {
          if (ax > ay * 1.2) s.dir = s.vx < 0 ? 1 : 3
          else if (ay > ax * 1.2) s.dir = s.vy < 0 ? 0 : 2
          if (ax > 4) s.face = s.vx < 0 ? -1 : 1
        } else if (P && Math.abs(P.x - s.x) > 1) {
          // Standing and talking: side-on, turned toward the partner.
          s.face = P.x < s.x ? -1 : 1
          s.dir = s.face < 0 ? 1 : 3
        } else if (!P && t > s.turnAt) {
          // Standing alone: glance the other way now and then.
          s.face = -s.face
          s.dir = s.face < 0 ? 1 : 3
          s.turnAt = t + 4 + Math.random() * 7
        }
      }
    }

    function drawVenue() {
      if (venue.complete && venue.naturalWidth) {
        const sc = Math.max(W / venue.naturalWidth, H / venue.naturalHeight)
        const sw = W / sc,
          sh = H / sc
        const sx = (venue.naturalWidth - sw) / 2
        // Phone: centered. Screen: anchor lower so the floor and lounge show.
        const sy = props.current.variant === "phone" ? (venue.naturalHeight - sh) / 2 : (venue.naturalHeight - sh) * 0.62
        ctx.drawImage(venue, sx, sy, sw, sh, 0, 0, W, H)
      } else {
        ctx.fillStyle = "#562056"
        ctx.fillRect(0, 0, W, H)
      }
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, "rgba(18,6,28,.55)")
      g.addColorStop(0.3, "rgba(18,6,28,.04)")
      g.addColorStop(1, "rgba(18,6,28,.35)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }

    function shadow(x: number, y: number, w: number, s: number) {
      ctx.fillStyle = "rgba(20,5,28,.3)"
      ctx.beginPath()
      ctx.ellipse(x, y, w, 6 * s, 0, 0, 7)
      ctx.fill()
    }

    function drawPerson(a: WorldAgent, s: Sim, speaking: boolean) {
      const sc = scaleAt(s.y)
      const moving = Math.hypot(s.vx, s.vy) > 4
      const talking = !!s.partner && s.settled
      // Walking: step bob. Talking: a gentle idle bob, a little livelier for whoever speaks.
      const bob = reduce
        ? 0
        : moving
          ? Math.sin((t * 4 + s.phase) * Math.PI) * 1.6 * sc
          : talking
            ? -Math.abs(Math.sin((t * (speaking ? 2.4 : 1.1) + s.phase) * Math.PI)) * (speaking ? 3 : 1.4) * sc
            : -Math.abs(Math.sin((t * 0.45 + s.phase) * Math.PI)) * 0.9 * sc // standing: a slow breath
      const dh = 150 * sc
      if (s.sprite === -2) {
        // Robot: a floating round portrait token.
        const r = dh * 0.26
        const float = reduce ? 0 : Math.sin((t * 1.4 + s.phase) * Math.PI) * 4 * sc
        const cy = s.y - dh * 0.5 + float + bob
        shadow(s.x, s.y, r * (0.8 - float / (60 * sc)), sc)
        ctx.save()
        ctx.shadowColor = "rgba(114,238,233,.75)"
        ctx.shadowBlur = 18 * sc
        ctx.fillStyle = "#2a0f45"
        ctx.beginPath()
        ctx.arc(s.x, cy, r + 3 * sc, 0, 7)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.beginPath()
        ctx.arc(s.x, cy, r, 0, 7)
        ctx.clip()
        if (portraits.complete && portraits.naturalWidth) {
          const pw = portraits.naturalWidth
          const sz = pw * 0.3
          ctx.translate(s.x, 0)
          ctx.scale(s.face, 1)
          ctx.drawImage(portraits, pw * 0.683, pw * 0.217, sz, sz, -r, cy - r, r * 2, r * 2)
        }
        ctx.restore()
        ctx.strokeStyle = "#72eee9"
        ctx.lineWidth = 2 * sc
        ctx.beginPath()
        ctx.arc(s.x, cy, r + 1.5 * sc, 0, 7)
        ctx.stroke()
      } else if (s.sprite === -1 && wf) {
        const f = wf[s.dir][reduce || !moving ? 1 : Math.floor(s.walk) % 4]
        const u = (dh * 1.05) / f.sh
        shadow(s.x, s.y, f.sw * u * 0.28, sc)
        ctx.drawImage(walk, f.sx, f.sy, f.sw, f.sh, s.x - f.ax * u, s.y - f.ay * u + (moving ? 0 : bob), f.sw * u, f.sh * u)
      } else if (sf) {
        const f = sf[Math.max(1, s.sprite)]
        const u = dh / f.sh
        shadow(s.x, s.y, f.sw * u * 0.3, sc)
        // Face the direction of travel, or the partner while talking.
        ctx.save()
        if (s.face < 0) {
          ctx.translate(s.x * 2, 0)
          ctx.scale(-1, 1)
        }
        const sheet = s.tint && tinted ? tinted : sprites
        ctx.drawImage(sheet, f.sx, f.sy, f.sw, f.sh, s.x - f.ax * u, s.y - f.ay * u + bob, f.sw * u, f.sh * u)
        ctx.restore()
      } else {
        ctx.fillStyle = a.color
        ctx.beginPath()
        ctx.arc(s.x, s.y - 30 * sc, 18 * sc, 0, 7)
        ctx.fill()
      }
      // Name tag under the feet.
      const fs = Math.max(10, Math.round(11 * sc * (props.current.variant === "screen" ? 1.25 : 1)))
      ctx.font = `800 ${fs}px "Avenir Next", Inter, system-ui, sans-serif`
      const label = a.isMe ? `${a.name} · you` : a.name
      const tw = ctx.measureText(label).width + fs * 2.2
      const x = s.x - tw / 2
      const y = s.y + 6 * sc
      ctx.fillStyle = "rgba(30,9,38,.82)"
      ctx.beginPath()
      ctx.roundRect(x, y, tw, fs * 2, fs)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.fillText(label, x + fs * 0.7, y + fs * 1.38)
      ctx.fillStyle = a.isMe ? "#72eee9" : a.color
      ctx.beginPath()
      ctx.arc(x + tw - fs * 0.75, y + fs, fs * 0.36, 0, 7)
      ctx.fill()
    }

    function wrap(text: string, max: number) {
      const words = text.split(/\s+/)
      const lines: string[] = []
      let line = ""
      for (const w of words) {
        const test = line ? `${line} ${w}` : w
        if (ctx.measureText(test).width > max && line) {
          lines.push(line)
          line = w
        } else line = test
      }
      if (line) lines.push(line)
      return lines
    }

    function drawBubble(b: WorldBubble) {
      const s = sims.get(b.speaker)
      if (!s) return
      // Talk once they are standing together, not mid-walk.
      const screen = props.current.variant === "screen"
      // On the big screen only pairs standing together talk; someone waiting their turn stays quiet.
      if (screen && !s.partner) return
      const P = s.partner ? sims.get(s.partner) : null
      if ((s.partner && !s.settled) || (P && P.partner === b.speaker && !P.settled)) {
        bubbleBorn.delete(b.key) // pop in once they arrive
        return
      }
      const k = screen ? H / 620 : 1
      const fs = Math.round((screen ? 13 : 11.5) * k)
      const max = (screen ? 230 : 180) * k
      if (!bubbleBorn.has(b.key)) bubbleBorn.set(b.key, t)
      const age = t - bubbleBorn.get(b.key)!
      const pop = reduce ? 1 : clamp(age / 0.25, 0, 1)
      ctx.font = `700 ${fs}px "Avenir Next", Inter, system-ui, sans-serif`
      let lines = wrap(b.text, max - 20 * k)
      if (lines.length > 3) {
        lines = lines.slice(0, 3)
        lines[2] = lines[2].replace(/\s*\S*$/, "") + "…"
      }
      const lh = fs * 1.3
      const bh = 26 * k + lines.length * lh
      const sc = scaleAt(s.y)
      const x = clamp(s.x - max * 0.5, 8, W - max - 8)
      const y = s.y - 150 * sc * 1.05 - bh - 8
      ctx.save()
      ctx.globalAlpha = pop
      ctx.translate(s.x, y + bh)
      ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop)
      ctx.translate(-s.x, -(y + bh))
      ctx.fillStyle = "#fff8df"
      ctx.shadowColor = "rgba(20,5,28,.35)"
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.roundRect(x, y, max, bh, 12 * k)
      ctx.fill()
      ctx.shadowBlur = 0
      // Tail
      ctx.beginPath()
      ctx.moveTo(clamp(s.x - 7, x + 10, x + max - 20), y + bh - 1)
      ctx.lineTo(clamp(s.x, x + 14, x + max - 14), y + bh + 9 * k)
      ctx.lineTo(clamp(s.x + 7, x + 20, x + max - 10), y + bh - 1)
      ctx.fill()
      ctx.fillStyle = "#25102e"
      lines.forEach((l, i) => ctx.fillText(l, x + 10 * k, y + 8 * k + fs + i * lh))
      ctx.fillStyle = "#ca3d92"
      ctx.font = `900 ${Math.round(fs * 0.72)}px "Avenir Next", Inter, system-ui, sans-serif`
      ctx.fillText(b.label.toUpperCase(), x + 10 * k, y + bh - 8 * k)
      ctx.restore()
    }

    function render() {
      ctx.clearRect(0, 0, W, H)
      drawVenue()
      const { agents, bubbles } = props.current
      const list = agents.filter((a) => sims.has(a.id)).sort((a, b) => sims.get(a.id)!.y - sims.get(b.id)!.y)
      const speaking = new Set(bubbles.map((b) => b.speaker))
      for (const a of list) drawPerson(a, sims.get(a.id)!, speaking.has(a.id))
      for (const b of bubbles) drawBubble(b)
    }

    let planAt = 0
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033) || 0
      last = now
      t += dt
      if (t - planAt > 0.25 || planAt === 0) {
        plan()
        planAt = t
      }
      step(dt)
      render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvas} className={`venue-world ${className}`} aria-label="Agent World: agents walking and talking at the venue" />
}
