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
  /** Pairs currently talking: they walk to a shared spot, stop, face each other and talk.
   *  On the phone, pass [] — my partners wait at their own spots and my agent visits `focus`. */
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
  wait: number
  walk: number
  dir: number
  phase: number
  sprite: number // -1 walk atlas (Shimo), -2 robot token, 1..3 character sheet column
  tint: boolean // man2: the floral-shirt man, shirt recoloured blue
  bornAt: number
  partner: string | null // who this agent is talking with right now
  settled: boolean // standing at the talk spot (no sliding while talking)
  face: number // 1 = facing right, -1 = facing left
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
const toward = (v: number, t: number, m: number) => (v < t ? Math.min(v + m, t) : Math.max(v - m, t))

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

    // Floor band where people can stand (fractions of height).
    const band = () => (props.current.variant === "phone" ? { y0: 0.5, y1: 0.8, x0: 0.1, x1: 0.9 } : { y0: 0.42, y1: 0.86, x0: 0.05, x1: 0.95 })
    const scaleAt = (y: number) => {
      const b = band()
      const u = clamp((y / H - b.y0) / (b.y1 - b.y0), 0, 1)
      const base = props.current.variant === "phone" ? H / 780 : H / 620
      return (0.62 + u * 0.55) * base
    }
    const randSpot = () => {
      const b = band()
      return { x: W * (b.x0 + Math.random() * (b.x1 - b.x0)), y: H * (b.y0 + Math.random() * (b.y1 - b.y0)) }
    }

    // Meeting spots for pairs on the big screen: a stable slot per pair, so a new pair
    // never makes the others walk away mid-conversation.
    // Fill order zig-zags between the two rows so neighbouring pairs (and their bubbles) don't touch.
    const ORDER = [
      [0, 0],
      [1, 2],
      [0, 2],
      [1, 0],
      [0, 1],
      [1, 3],
      [0, 3],
      [1, 1],
    ]
    const spotFor = (i: number, n: number) => {
      const b = band()
      const cols = 4
      const rows = Math.max(2, Math.ceil(n / cols))
      const [row, col] = i < ORDER.length ? ORDER[i] : [Math.floor(i / cols), i % cols]
      // Stagger alternate rows so pairs do not stand in a straight line.
      const off = row % 2 ? 0.5 / cols : 0
      const x = W * (b.x0 + 0.06 + ((((col + 0.5) / cols + off) % 1) * (b.x1 - b.x0 - 0.12)))
      const y = H * (b.y0 + 0.08 + ((row + 0.5) / rows) * (b.y1 - b.y0 - 0.16))
      return { x, y }
    }
    const slots = new Map<string, number>()
    const slotOf = (key: string, live: Set<string>) => {
      for (const k of [...slots.keys()]) if (!live.has(k)) slots.delete(k)
      let i = slots.get(key)
      if (i === undefined) {
        const used = new Set(slots.values())
        i = 0
        while (used.has(i)) i++
        slots.set(key, i)
      }
      return i
    }
    // Phone: where each of my partners waits for my agent (fractions of the floor band).
    const STATIONS = [
      { x: 0.7, y: 0.3 },
      { x: 0.28, y: 0.18 },
      { x: 0.68, y: 0.95 },
      { x: 0.3, y: 0.8 },
    ]

    function plan() {
      const { agents, pairs, focus, partners, variant } = props.current
      const ids = new Set(agents.map((a) => a.id))
      for (const id of [...sims.keys()]) if (!ids.has(id)) sims.delete(id)
      for (const a of agents) {
        const look = spriteFor(a)
        const ex = sims.get(a.id)
        if (ex) {
          ex.sprite = look.sprite
          ex.tint = look.tint
          continue
        }
        const s = randSpot()
        // New arrivals walk in from the bottom edge.
        sims.set(a.id, {
          x: s.x,
          y: H * 0.98,
          vx: 0,
          vy: 0,
          tx: s.x,
          ty: s.y,
          wait: 0,
          walk: 0,
          dir: 0,
          phase: (hash(a.id) % 100) / 16,
          sprite: look.sprite,
          tint: look.tint,
          bornAt: t,
          partner: null,
          settled: false,
          face: 1,
        })
      }
      const talking = new Map<string, string>()
      const target = (id: string, x: number, y: number, partner: string) => {
        const S = sims.get(id)
        if (!S) return
        // A new spot means walking again; the same spot keeps them planted.
        if (Math.hypot(S.tx - x, S.ty - y) > 2) {
          S.tx = x
          S.ty = y
          S.settled = false
        }
        S.wait = 0
        talking.set(id, partner)
      }
      const k = H / (variant === "phone" ? 780 : 620)
      if (variant === "screen") {
        const sep = 34 * k
        const live = new Set(pairs.map(([a, b]) => [a, b].sort().join("|")))
        for (const [a, b] of pairs) {
          if (talking.has(a) || talking.has(b)) continue // one conversation on screen per agent
          const sp = spotFor(slotOf([a, b].sort().join("|"), live), Math.max(8, pairs.length))
          // Whoever is already further left takes the left side, so nobody crosses over.
          const A = sims.get(a), B = sims.get(b)
          const aLeft = !A || !B || A.x <= B.x
          target(a, sp.x + (aLeft ? -sep : sep), sp.y, b)
          target(b, sp.x + (aLeft ? sep : -sep), sp.y, a)
        }
      } else {
        const me = agents.find((a) => a.isMe)
        const b = band()
        const live = new Set(partners)
        for (const pid of partners) {
          if (!sims.has(pid) || !me) continue
          const st = STATIONS[slotOf(pid, live) % STATIONS.length]
          target(pid, W * (b.x0 + st.x * (b.x1 - b.x0)), H * (b.y0 + st.y * (b.y1 - b.y0)), me.id)
        }
        const M = me ? sims.get(me.id) : null
        const F = focus ? sims.get(focus) : null
        if (me && M && F && focus && talking.has(focus)) {
          // My agent walks up beside the partner, on the side nearer the middle.
          const side = F.tx > W / 2 ? -1 : 1
          target(me.id, F.tx + side * 62 * k, F.ty + 4, focus)
        } else if (me && M) {
          target(me.id, W * 0.5, H * (b.y1 - 0.02), "")
        }
      }
      for (const [id, s] of sims) {
        const p = talking.get(id)
        if (p !== undefined) {
          s.partner = p || null
          continue
        }
        if (s.partner) {
          // Conversation over: back to roaming after a short beat.
          s.partner = null
          s.settled = false
          s.wait = 0.6 + Math.random()
          const n = randSpot()
          s.tx = n.x
          s.ty = n.y
          continue
        }
        const d = Math.hypot(s.tx - s.x, s.ty - s.y)
        if (d < 8 && s.wait <= 0) {
          const n = randSpot()
          s.tx = n.x
          s.ty = n.y
          s.wait = 1.5 + Math.random() * 3
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
        if (s.partner || a.isMe) {
          // Heading to a talk spot: walk at an even pace, then stop dead on arrival (no sliding).
          if (d < 5) {
            s.x = s.tx
            s.y = s.ty
            s.vx = 0
            s.vy = 0
            s.settled = true
          } else {
            s.settled = false
            const speed = (a.isMe ? 78 : 58) * (H / 700)
            s.vx = (dx / d) * speed
            s.vy = (dy / d) * speed
            const st = Math.min(1, (speed * dt) / d)
            s.x += dx * st
            s.y += dy * st
            s.walk += speed * dt * 0.1
          }
        } else {
          let ux = 0,
            uy = 0
          if (s.wait > 0 && d < 8) {
            s.wait -= dt
          } else if (d > 4) {
            const speed = Math.min(40, d * 1.2) * (H / 700)
            ux = (dx / d) * speed
            uy = (dy / d) * speed
          }
          s.vx = toward(s.vx, ux, 200 * dt)
          s.vy = toward(s.vy, uy, 200 * dt)
          const ox = s.x,
            oy = s.y
          s.x += s.vx * dt
          s.y += s.vy * dt
          s.walk += Math.hypot(s.x - ox, s.y - oy) * 0.1
        }
        const ax = Math.abs(s.vx),
          ay = Math.abs(s.vy)
        const P = s.partner ? sims.get(s.partner) : null
        if (Math.hypot(s.vx, s.vy) > 6) {
          if (ax > ay * 1.2) s.dir = s.vx < 0 ? 1 : 3
          else if (ay > ax * 1.2) s.dir = s.vy < 0 ? 0 : 2
          if (ax > 4) s.face = s.vx < 0 ? -1 : 1
        } else if (P && Math.abs(P.x - s.x) > 1) {
          // Standing and talking: turn toward the partner.
          s.face = P.x < s.x ? -1 : 1
          s.dir = s.face < 0 ? 1 : 3
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
            : 0
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
        ctx.drawImage(walk, f.sx, f.sy, f.sw, f.sh, s.x - f.ax * u, s.y - f.ay * u + (talking ? bob : 0), f.sw * u, f.sh * u)
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
      const P = s.partner ? sims.get(s.partner) : null
      if ((s.partner && !s.settled) || (P && P.partner === b.speaker && !P.settled)) {
        bubbleBorn.delete(b.key) // pop in once they arrive
        return
      }
      const screen = props.current.variant === "screen"
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
