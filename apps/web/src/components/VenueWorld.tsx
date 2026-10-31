// The animated venue ("Vice City Social" Agent World, from docs/design/vice-agent-world.html).
// One canvas, a rAF loop, and React props pushed into a ref each render.
import { useEffect, useRef } from "react"

export interface WorldAgent {
  id: string
  name: string
  color: string // role accent for the name tag dot
  isMe?: boolean
}

export interface WorldBubble {
  key: string // line id; a new key re-pops the bubble
  speaker: string // agent id the bubble sits above
  label: string // "MAYA'S AGENT"
  text: string
}

interface Props {
  agents: WorldAgent[]
  /** Pairs currently talking. On the phone, pairs that include me are ignored (me walks to `focus`). */
  pairs: [string, string][]
  /** Phone: the partner my agent walks toward. */
  focus?: string | null
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
  sprite: number
  bornAt: number
}

type Frame = { sx: number; sy: number; sw: number; sh: number; ax: number; ay: number }

const VENUE = "/art/venue.jpg"
const SPRITES = "/art/sprites.png"
const WALK = "/art/walk.png"

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

export function VenueWorld({ agents, pairs, focus, bubbles, variant, className = "" }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const props = useRef({ agents, pairs, focus, bubbles, variant })
  props.current = { agents, pairs, focus, bubbles, variant }

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext("2d")!
    const venue = loadImg(VENUE)
    const sprites = loadImg(SPRITES)
    const walk = loadImg(WALK)
    let wf: Frame[][] | null = null
    let sf: Frame[] | null = null
    walk.onload = () => (wf = walkFrames(walk))
    sprites.onload = () => (sf = spriteFrames(sprites))
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

    // Meeting spots for pairs on the big screen.
    const spotFor = (i: number, n: number) => {
      const b = band()
      const cols = Math.min(4, Math.max(1, Math.ceil(n / 2)))
      const row = Math.floor(i / cols)
      const col = i % cols
      const rows = Math.max(1, Math.ceil(n / cols))
      const x = W * (b.x0 + 0.08 + ((col + 0.5) / cols) * (b.x1 - b.x0 - 0.16))
      const y = H * (b.y0 + 0.06 + ((row + 0.5) / rows) * (b.y1 - b.y0 - 0.12))
      return { x, y }
    }

    function plan() {
      const { agents, pairs, focus, variant } = props.current
      const ids = new Set(agents.map((a) => a.id))
      for (const id of [...sims.keys()]) if (!ids.has(id)) sims.delete(id)
      for (const a of agents) {
        if (!sims.has(a.id)) {
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
            sprite: a.isMe ? -1 : 1 + (hash(a.id) % 3),
            bornAt: t,
          })
        }
      }
      const pinned = new Set<string>()
      const sep = (variant === "phone" ? 62 : 70) * (H / (variant === "phone" ? 780 : 620))
      if (variant === "screen") {
        pairs.forEach(([a, b], i) => {
          const sp = spotFor(i, pairs.length)
          const A = sims.get(a)
          const B = sims.get(b)
          if (A) {
            A.tx = sp.x - sep
            A.ty = sp.y
            pinned.add(a)
          }
          if (B) {
            B.tx = sp.x + sep
            B.ty = sp.y
            pinned.add(b)
          }
        })
      } else {
        const me = agents.find((a) => a.isMe)
        const target = focus ? sims.get(focus) : null
        const M = me ? sims.get(me.id) : null
        if (target && focus) {
          // The partner stands near the middle; my agent walks up to them.
          const b = band()
          target.tx = W * 0.64
          target.ty = H * (b.y0 + (b.y1 - b.y0) * 0.45)
          pinned.add(focus)
          if (M) {
            M.tx = target.tx - sep * 1.6
            M.ty = target.ty + 6
            pinned.add(M && me ? me.id : "")
          }
        } else if (M && me) {
          const b = band()
          M.tx = W * 0.5
          M.ty = H * (b.y1 - 0.02)
          pinned.add(me.id)
        }
      }
      for (const [id, s] of sims) {
        if (pinned.has(id)) continue
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
        let ux = 0,
          uy = 0
        if (s.wait > 0 && d < 8) {
          s.wait -= dt
        } else if (d > 4) {
          const speed = Math.min(a.isMe ? 70 : 40, d * 1.2) * (H / 700)
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
        const ax = Math.abs(s.vx),
          ay = Math.abs(s.vy)
        if (Math.hypot(s.vx, s.vy) > 6) {
          if (ax > ay * 1.2) s.dir = s.vx < 0 ? 1 : 3
          else if (ay > ax * 1.2) s.dir = s.vy < 0 ? 0 : 2
        } else if (a.isMe && props.current.focus) {
          const f = sims.get(props.current.focus)
          if (f) s.dir = f.x < s.x ? 1 : 3
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

    function drawPerson(a: WorldAgent, s: Sim) {
      const sc = scaleAt(s.y)
      const moving = Math.hypot(s.vx, s.vy) > 4
      const bob = reduce || !moving ? 0 : Math.sin((t * 4 + s.phase) * Math.PI) * 1.6 * sc
      const dh = 150 * sc
      if (s.sprite < 0 && wf) {
        const f = wf[s.dir][reduce || !moving ? 1 : Math.floor(s.walk) % 4]
        const u = (dh * 1.05) / f.sh
        shadow(s.x, s.y, f.sw * u * 0.28, sc)
        ctx.drawImage(walk, f.sx, f.sy, f.sw, f.sh, s.x - f.ax * u, s.y - f.ay * u, f.sw * u, f.sh * u)
      } else if (sf) {
        const f = sf[Math.max(1, s.sprite)]
        const u = dh / f.sh
        shadow(s.x, s.y, f.sw * u * 0.3, sc)
        // Face the direction of travel.
        ctx.save()
        if (s.vx < -4) {
          ctx.translate(s.x * 2, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(sprites, f.sx, f.sy, f.sw, f.sh, s.x - f.ax * u, s.y - f.ay * u + bob, f.sw * u, f.sh * u)
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
      for (const a of list) drawPerson(a, sims.get(a.id)!)
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
