import { useEffect, useState } from "react"

/** Types out text that just arrived; shows older text instantly. */
export function Typewriter({ text, at, cps = 70 }: { text: string; at: number; cps?: number }) {
  const fresh = Date.now() - at < 2500
  const [n, setN] = useState(fresh ? 0 : text.length)
  useEffect(() => {
    if (n >= text.length) return
    const t = setTimeout(() => setN((x) => Math.min(text.length, x + 2)), 2000 / cps)
    return () => clearTimeout(t)
  }, [n, text, cps])
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="caret" />}
    </>
  )
}
