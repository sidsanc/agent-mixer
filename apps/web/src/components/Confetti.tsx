import { useMemo } from "react"

const COLORS = ["#ff8a2a", "#b18cff", "#3ee08f", "#ffd23f", "#ff6fb5", "#f3eefc"]

/** One-shot CSS confetti burst. Remount (change key) to replay. */
export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        i,
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        dur: 1.6 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 220,
        rot: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length],
        w: 6 + Math.random() * 7,
        round: Math.random() < 0.3,
      })),
    [count],
  )
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.i}
          style={
            {
              left: `${p.left}%`,
              width: p.w,
              height: p.round ? p.w : p.w * 0.45,
              borderRadius: p.round ? "50%" : 2,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              "--drift": `${p.drift}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
