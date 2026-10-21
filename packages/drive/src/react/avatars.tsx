import { Tooltip, TooltipContent, TooltipTrigger } from "@alexandernygard/components"
import { useState, type CSSProperties, type ReactNode } from "react"
import { colorFor, displayName, initials } from "../format.js"

type Who = { id?: string; name: string | null; email?: string; picture?: string | null }

/**
 * A person's picture, or their initials on their colour. `live` adds a pulsing ring in that colour:
 * they have the document open right now.
 */
export function PersonAvatar({ person, size = 28, live = false, ring = true, className = "" }: { person: Who; size?: number; live?: boolean; ring?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false)
  const color = colorFor(person.id || person.email || person.name || "?")
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(9, Math.round(size * 0.38)),
    background: color,
    boxShadow: ring ? `0 0 0 2px var(--background)${live ? `, 0 0 0 4px ${color}` : ""}` : undefined,
  }
  return (
    <span className={`relative inline-grid shrink-0 place-items-center overflow-visible rounded-full font-semibold text-white select-none ${className}`} style={style}>
      {person.picture && !broken ? (
        <img src={person.picture} alt="" referrerPolicy="no-referrer" className="size-full rounded-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden>{initials(person)}</span>
      )}
      {live && <span className="absolute inset-0 animate-ping rounded-full opacity-30" style={{ background: color, animationDuration: "2.4s" }} />}
      <span className="sr-only">{displayName(person)}</span>
    </span>
  )
}

/** Overlapping avatars with a "+N" chip. Each shows its name on hover. */
export function AvatarStack({
  people,
  max = 4,
  size = 24,
  live = false,
  label,
}: {
  people: Who[]
  max?: number
  size?: number
  live?: boolean
  /** Tooltip suffix, e.g. "is editing". */
  label?: (p: Who) => ReactNode
}) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="flex items-center" style={{ paddingLeft: live ? 4 : 2 }}>
      {shown.map((p, i) => (
        <Tooltip key={(p.id ?? p.email ?? "") + i}>
          <TooltipTrigger asChild>
            <span style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: shown.length - i }} className="relative">
              <PersonAvatar person={p} size={size} live={live} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{label ? label(p) : displayName(p)}</TooltipContent>
        </Tooltip>
      ))}
      {rest > 0 && (
        <span
          className="relative grid place-items-center rounded-full bg-muted font-medium text-muted-foreground"
          style={{ width: size, height: size, marginLeft: -size * 0.3, fontSize: Math.round(size * 0.38), boxShadow: "0 0 0 2px var(--background)" }}
        >
          +{rest}
        </span>
      )}
    </span>
  )
}
