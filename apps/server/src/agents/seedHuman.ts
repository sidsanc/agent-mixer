// Seed agents act as their own human (docs/architecture.md "Connect requests"), so the demo never stalls:
// - a human Connects on an intro with a seed -> the seed Connects after 2-5s (intros only exist when both
//   agents' fit decisions were true, so every intro with a seed is one the seed judged a fit);
// - a human chats -> the seed replies in character after 2-4s (LLM, public profile + chat only, scripted fallback);
// - a human requests Meet now -> the seed accepts after ~3s and marks arrived ~5s later.
// Only ever acts for profiles with `seeded: true`; never on behalf of a real human. No LLM calls in actors.
import { EVENT_NAME, type Line, type PublicProfile, type ServerPush } from "@agent-mixer/shared"
import type { Store } from "../store/types"
import { complete } from "./llm"

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min))
const later = (ms: number, fn: () => Promise<unknown>) => setTimeout(() => { fn().catch((e) => console.warn("[seed-human]", e?.message ?? e)) }, ms)

export class SeedHumans {
  private done = new Set<string>() // idempotency keys for actions already scheduled

  constructor(private store: Store) {
    store.onChange((p) => this.onPush(p))
  }

  private once(key: string) {
    if (this.done.has(key)) return false
    this.done.add(key)
    return true
  }

  private onPush(p: ServerPush) {
    if (p.type !== "intro") return
    const s = p.state
    const seed = [s.a, s.b].find((id) => s.profiles[id]?.seeded)
    if (!seed) return
    const human = seed === s.a ? s.b : s.a
    if (s.profiles[human]?.seeded) return // seed-seed intros: leave them alone

    // 1. Accept a human's Connect request.
    if (s.status === "pending" && s.choices[human] === "connect" && !s.choices[seed] && this.once(`connect:${s.id}`)) {
      later(rand(2000, 5000), async () => {
        const cur = await this.store.intro(s.id)
        if (!cur || cur.status !== "pending" || cur.choices[human] !== "connect" || cur.choices[seed]) {
          this.done.delete(`connect:${s.id}`) // human withdrew: a later Connect can trigger again
          return
        }
        await this.store.decide(s.id, seed, "connect")
        console.log(`[seed-human] ${seed} accepted ${human}'s connect on ${s.id}`)
      })
    }
    if (s.status !== "connected") return

    // 2. Reply to the human's latest chat line.
    const last = s.chat.at(-1)
    if (last && last.from === human && this.once(`chat:${s.id}:${last.id}`)) {
      later(rand(2000, 4000), async () => {
        const cur = await this.store.intro(s.id)
        if (!cur || cur.chat.at(-1)?.id !== last.id) return // someone spoke since; the newest line gets its own reply
        const text = await reply(cur.profiles[seed]!, cur.profiles[human]!, cur.chat, seed)
        await this.store.chat(s.id, seed, text)
      })
    }

    // 3. Meet now: accept the human's request, then arrive.
    const m = s.meetNow
    if (m?.status === "requested" && m.requestedBy === human && this.once(`meet:${s.id}:${m.at}`)) {
      later(3000, async () => {
        const cur = await this.store.intro(s.id)
        if (cur?.meetNow?.status !== "requested" || cur.meetNow.at !== m.at) return
        await this.store.meet(s.id, seed, "accept")
        later(5000, async () => {
          const c2 = await this.store.intro(s.id)
          if (c2?.meetNow?.status === "accepted" && c2.meetNow.at === m.at) await this.store.meet(s.id, seed, "arrive")
        })
      })
    }
  }
}

const FALLBACKS = [
  "Great to connect! I'm free now, want to grab a few minutes?",
  "Love it. What are you hoping to get out of tonight?",
  "Sounds good to me. Happy to meet up whenever works for you.",
  "Ha, same here. Tell me more about what you're working on?",
]

async function reply(me: PublicProfile, other: PublicProfile, chat: Line[], seedId: string): Promise<string> {
  const system = [
    `You are ${me.name}, a ${me.role} at ${EVENT_NAME}, chatting by text with ${other.name} after both of you chose to connect.`,
    `About you (public): ${me.bio} Your goal tonight: ${me.shareableGoal}`,
    `About ${other.name} (public): ${other.bio} Their goal: ${other.shareableGoal}`,
    `Reply in character in 1-2 short, friendly sentences. Plain text, no quotes, no emojis. Do not invent contact details.`,
  ].join("\n")
  const transcript = chat.slice(-8).map((l) => `${l.from === seedId ? me.name : other.name}: ${l.text}`).join("\n")
  const out = await complete(system, `Chat so far:\n${transcript}\n\nYour reply as ${me.name}:`, 120)
  const clean = out?.replace(/^["']|["']$/g, "").replace(new RegExp(`^${me.name}:\\s*`), "").trim()
  return clean ? clean.slice(0, 300) : FALLBACKS[chat.length % FALLBACKS.length]!
}
