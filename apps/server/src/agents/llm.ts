// Thin LLM wrapper. Anthropic (default claude-haiku-5-5) or OpenAI; null when no key so callers use the script.
import Anthropic from "@anthropic-ai/sdk"

export type LlmProvider = "anthropic" | "openai" | "scripted"

export function llmProvider(): LlmProvider {
  if (process.env.LLM === "scripted") return "scripted"
  if (process.env.ANTHROPIC_API_KEY) return "anthropic"
  if (process.env.OPENAI_API_KEY) return "openai"
  return "scripted"
}

let anthropic: Anthropic | null = null
// A turn never waits longer than this for the model; on timeout the caller uses the scripted line.
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 6000)
// After repeated failures (bad key, outage) skip the LLM for a while so turns stay fast.
const BREAKER_FAILS = 3
const BREAKER_MS = Number(process.env.LLM_BREAKER_MS ?? 30000)
let fails = 0
let openUntil = 0

export const llmStats = { calls: 0, ok: 0, failed: 0, timedOut: 0, skipped: 0 }

/** Returns the model's text, or null on any failure or timeout (caller falls back to the script). */
export async function complete(system: string, user: string, maxTokens = 200): Promise<string | null> {
  if (llmProvider() === "scripted") return null
  if (Date.now() < openUntil) { llmStats.skipped++; return null }
  llmStats.calls++
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((res) => { timer = setTimeout(() => { llmStats.timedOut++; res(null) }, TIMEOUT_MS) })
  const out = await Promise.race([call(system, user, maxTokens), timeout]).finally(() => clearTimeout(timer))
  if (out) { llmStats.ok++; fails = 0; return out }
  llmStats.failed++
  if (++fails >= BREAKER_FAILS) {
    openUntil = Date.now() + BREAKER_MS
    fails = 0
    console.warn(`[llm] ${BREAKER_FAILS} failures in a row, using scripted lines for ${BREAKER_MS / 1000}s`)
  }
  return null
}

async function call(system: string, user: string, maxTokens: number): Promise<string | null> {
  const provider = llmProvider()
  try {
    if (provider === "anthropic") {
      anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 })
      const res = await anthropic.messages.create({
        model: process.env.LLM_MODEL || "claude-haiku-5-5",
        max_tokens: maxTokens,
        // Short chat lines don't need thinking; with it on, Haiku 5.5 spends the budget and returns no text.
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: user }],
      })
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim()
      if (!text) console.warn(`[llm] anthropic returned no text (stop_reason=${res.stop_reason}, blocks=${res.content.map((b) => b.type).join(",")})`)
      return text || null
    }
    if (provider === "openai") {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: process.env.LLM_MODEL || "gpt-4.1-mini",
            max_completion_tokens: maxTokens,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
          }),
        })
        if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`)
        const j: any = await res.json()
        return (j.choices?.[0]?.message?.content ?? "").trim() || null
      } finally { clearTimeout(t) }
    }
  } catch (e: any) {
    console.warn(`[llm] ${provider} call failed, using scripted fallback: ${e?.message ?? e}`)
  }
  return null
}

export function parseJson<T>(text: string | null): T | null {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as T } catch { return null }
}
