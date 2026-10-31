// What one agent says and decides. Prompts see: own public profile + own shareable goal,
// own private intent (decisions only, never revealed), the other's PUBLIC profile, and the transcript.
import { EVENT_NAME, mutualScore, type Line, type Profile, type PublicProfile, type Role } from "@agent-mixer/shared"
import { complete, parseJson } from "./llm"

const ROLE_WORD: Record<Role, string> = {
  founder: "a founder", investor: "an investor", engineer: "an engineer",
  designer: "a designer", gtm: "in GTM and sales", other: "here to meet people",
}

function profileBlock(p: PublicProfile) {
  return `Name: ${p.name}\nRole: ${p.role}\nBio: ${p.bio || "(none)"}\nShareable event goal: ${p.shareableGoal}`
}

function transcriptBlock(lines: Line[], me: Profile, other: PublicProfile) {
  if (!lines.length) return "(no lines yet; you speak first)"
  return lines.map((l) => `${l.from === me.id ? me.agentName : other.agentName}: ${l.text}`).join("\n")
}

function systemPrompt(me: Profile, other: PublicProfile) {
  return [
    `You are ${me.agentName}, an AI agent representing ${me.name} at ${EVENT_NAME}, a live networking event.`,
    `You are in a short one-to-one chat with ${other.agentName}, who represents ${other.name}.`,
    ``,
    `YOUR PERSON (public, you may share):`,
    profileBlock(me),
    ``,
    `YOUR PERSON'S PRIVATE INTENT (confidential; use it ONLY to judge fit and choose what to ask about):`,
    me.privateIntent || "(none)",
    `Never quote, paraphrase, summarise or hint at the private intent. Never mention that private intent exists.`,
    `Never share contact details. Only discuss the public profile, the shareable goal and this conversation.`,
    ``,
    `THE OTHER PERSON (public profile):`,
    profileBlock(other),
  ].join("\n")
}

/** One conversational line. `index` is 0-based; `total` lines in the conversation. */
export async function nextLine(me: Profile, other: PublicProfile, lines: Line[], index: number, total: number): Promise<string> {
  const last = index === total - 1
  const user = [
    `Transcript so far:`,
    transcriptBlock(lines, me, other),
    ``,
    last
      ? `Write the final line: warm, one or two short sentences, wrap up naturally. No question.`
      : `Write your next line: one or two short sentences (under 35 words), natural and specific to ${other.name}. ` +
        `React to what they said, then ask ONE concrete follow-up question that helps judge whether ${me.name} and ${other.name} should meet.`,
    `Output only the line itself, no name prefix, no quotes.`,
  ].join("\n")
  const out = await complete(systemPrompt(me, other), user, 120)
  let text = (out ?? "").replace(/^["']|["']$/g, "").replace(/^[^:]{0,40}agent:\s*/i, "").trim()
  if (!text || leaksPrivate(text, me)) {
    if (text) console.warn(`[agents] blocked a line from ${me.id} that echoed private intent`)
    text = scriptedLine(me, other, index, total)
  }
  return text.slice(0, 400)
}

/** True if the line shares a 4-word run with the private intent or contains the contact. */
export function leaksPrivate(text: string, me: Profile): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
  if (me.contact && text.toLowerCase().includes(me.contact.toLowerCase())) return true
  const pw = norm(me.privateIntent || "")
  const tw = norm(text).join(" ")
  for (let i = 0; i + 4 <= pw.length; i++) {
    if (tw.includes(pw.slice(i, i + 4).join(" "))) return true
  }
  return false
}

export function scriptedLine(me: Profile, other: PublicProfile, index: number, total: number): string {
  const goal = me.shareableGoal.replace(/\.$/, "")
  if (index === total - 1) {
    return `This was useful. I think ${me.name} and ${other.name} would get a lot out of ten minutes in person.`
  }
  switch (index) {
    case 0:
      return `Hi, I'm ${me.agentName}. ${me.name} is ${ROLE_WORD[me.role]} and is here to ${lowerFirst(goal)}. What is ${other.name} hoping to find tonight?`
    case 1:
      return `Nice to meet you. ${me.name} is ${ROLE_WORD[me.role]}${me.bio ? ` (${me.bio.replace(/\.$/, "")})` : ""} and wants to ${lowerFirst(goal)}. What is ${other.name} working on right now?`
    case 2:
      return `That fits well with what ${me.name} is after. What would a great outcome from meeting ${me.name} look like for ${other.name}?`
    default:
      return `Got it. What is the one thing ${other.name} would want ${me.name} to know before they talk?`
  }
}

function lowerFirst(s: string) { return s ? s[0].toLowerCase() + s.slice(1) : s }

export interface FitDecision {
  fit: boolean
  score: number // 0..100
  why: string
  iOffer: string
  theyOffer: string
  summary: string
  opener: string
}

// Scripted (no-LLM) fit: what each role listens for in the other's public goal/bio.
const WANTS: Record<Role, RegExp> = {
  founder: /invest|back|fund|join|startup|founding|engineer|design|sales|gtm/i,
  investor: /rais|seed|round|fund|invest/i,
  engineer: /hir|engineer|technical|cto|founding/i,
  designer: /design|ux|ui|brand/i,
  gtm: /sales|gtm|go-to-market|revenue|customers/i,
  other: /meet|ideas|people|intro|curious/i,
}

/** Private fit decision. Uses the private intent; its output text must not reveal it. */
export async function decideFit(me: Profile, other: PublicProfile, lines: Line[], planted: boolean): Promise<FitDecision> {
  const user = [
    `The conversation is over. Transcript:`,
    transcriptBlock(lines, me, other),
    ``,
    `Decide privately whether ${me.name} and ${other.name} should meet in person, using the public profiles, the conversation and the private intent.`,
    `Reply with JSON only: {"fit": true|false, "score": <0-100 how strong the fit is>, "why": "<one sentence, public-safe>", "iOffer": "<what ${me.name} offers ${other.name}, short>", ` +
      `"theyOffer": "<what ${other.name} offers ${me.name}, short>", "summary": "<one sentence on what the agents discussed>", "opener": "<a first line ${me.name} could say to ${other.name} in person>"}.`,
    `Nothing in why/iOffer/theyOffer/summary/opener may reveal or hint at the private intent.`,
  ].join("\n")
  const parsed = parseJson<Partial<FitDecision>>(await complete(systemPrompt(me, other), user, 300))
  const fallback = scriptedFit(me, other, planted)
  if (!parsed || typeof parsed.fit !== "boolean") return fallback
  const d: FitDecision = {
    fit: parsed.fit || planted, // planted partners always match so every judge gets a card
    score: typeof parsed.score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.score))) : fallback.score,
    why: str(parsed.why, fallback.why),
    iOffer: str(parsed.iOffer, fallback.iOffer),
    theyOffer: str(parsed.theyOffer, fallback.theyOffer),
    summary: str(parsed.summary, fallback.summary),
    opener: str(parsed.opener, fallback.opener),
  }
  for (const k of ["why", "iOffer", "theyOffer", "summary", "opener"] as const) {
    if (leaksPrivate(d[k], me)) d[k] = fallback[k]
  }
  return d
}

function str(v: unknown, dflt: string) { return typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : dflt }

export function scriptedFit(me: Profile, other: PublicProfile, planted: boolean): FitDecision {
  const fit = planted || WANTS[me.role].test(`${other.shareableGoal} ${other.bio}`)
  return {
    fit,
    score: mutualScore(me, other),
    why: `${me.name} wants to ${lowerFirst(me.shareableGoal.replace(/\.$/, ""))}, and ${other.name} wants to ${lowerFirst(other.shareableGoal.replace(/\.$/, ""))}.`,
    iOffer: `${me.name}'s perspective as ${ROLE_WORD[me.role]}`,
    theyOffer: `${other.name}'s perspective as ${ROLE_WORD[other.role]}`,
    summary: `${me.agentName} and ${other.agentName} compared goals and found real overlap.`,
    opener: `Hi ${other.name}, our agents said we should talk. What are you building right now?`,
  }
}
