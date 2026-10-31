import type { Role } from "@agent-mixer/shared"

// Vice City Social accents (docs/design/vice-agent-world.html).
export const ROLE_COLOR: Record<Role, string> = {
  founder: "#ff5cab",
  investor: "#39d99d",
  engineer: "#72eee9",
  designer: "#ffd45b",
  gtm: "#ff9a4d",
  other: "#c9a7ff",
}

export const ROLE_LABEL: Record<Role, string> = {
  founder: "Founder",
  investor: "Investor",
  engineer: "Engineer",
  designer: "Designer",
  gtm: "GTM/Sales",
  other: "Other",
}

export function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Same sprite the venue world draws for this person (1..3 of the character sheet). */
export const spriteOf = (id: string) => 1 + (hash(id) % 3)

interface Props {
  id: string
  role: Role
  size?: number
  /** Your own agent: the robot portrait. */
  agent?: boolean
  className?: string
  talking?: boolean
}

/** Round face crop from the character art. */
export function Avatar({ id, role, size = 46, agent = false, className = "" }: Props) {
  return (
    <span
      className={`face ${agent ? "face-agent" : `face-s${spriteOf(id)}`} ${className}`}
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ROLE_COLOR[role] ?? ROLE_COLOR.other}` }}
      aria-hidden="true"
    />
  )
}
