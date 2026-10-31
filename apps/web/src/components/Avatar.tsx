import type { AvatarId, Role } from "@agent-mixer/shared"

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

/** Portrait face for a picked character: men share the sunglasses face, women the woman face. */
export const FACE_OF: Record<AvatarId, "man" | "woman" | "robot"> = {
  man1: "man",
  man2: "man",
  woman1: "woman",
  woman2: "woman",
  robot: "robot",
}

export const faceClass = (id: string, avatar?: AvatarId | null) => (avatar && FACE_OF[avatar] ? `face-p-${FACE_OF[avatar]}` : `face-s${spriteOf(id)}`)

interface Props {
  id: string
  role: Role
  avatar?: AvatarId | null
  size?: number
  /** Your own agent: the robot portrait. */
  agent?: boolean
  className?: string
  talking?: boolean
}

/** Round face crop from the character art. */
export function Avatar({ id, role, avatar, size = 46, agent = false, className = "" }: Props) {
  return (
    <span
      className={`face ${agent ? "face-agent" : faceClass(id, avatar)} ${className}`}
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ROLE_COLOR[role] ?? ROLE_COLOR.other}` }}
      aria-hidden="true"
    />
  )
}
