/** Enough of a person to name them. Collab presence may lack an email. */
export type Named = { name: string | null; email?: string }

/** "Ada Lovelace" → "Ada", falling back to the email's local part. */
export function firstName(p: Named | null | undefined): string {
  if (!p) return "Someone"
  return p.name?.split(/\s+/)[0] || (p.email ?? "").split("@")[0] || "Someone"
}

export function displayName(p: Named | null | undefined): string {
  if (!p) return "Someone"
  return p.name || (p.email ?? "").split("@")[0] || "Someone"
}

export function initials(p: Named): string {
  const parts = (p.name || (p.email ?? "").split("@")[0] || "?").split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase()
}

const PALETTE = ["#e5484d", "#f76b15", "#ca8a04", "#30a46c", "#0d9488", "#0090ff", "#6e56cf", "#d6409f"]

/** Same colours as @alexandernygard/collab's colorFor, so a person has one colour everywhere. */
export function colorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]!
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null

/** "just now", "5 min ago", "yesterday", then a date. */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.round((now - at) / 1000)
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7 && rtf) return rtf.format(-d, "day")
  const date = new Date(at)
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}
