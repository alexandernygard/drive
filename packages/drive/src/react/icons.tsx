import {
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderIcon,
  PresentationIcon,
  FileSpreadsheetIcon,
  type LucideIcon,
} from "lucide-react"
import type { CSSProperties } from "react"
import { KIND_COLORS } from "../apps.js"
import type { Kind } from "../types.js"

export function iconFor(kind: Kind, mime?: string | null): LucideIcon {
  switch (kind) {
    case "folder":
      return FolderIcon
    case "doc":
      return FileTextIcon
    case "sheet":
      return FileSpreadsheetIcon
    case "deck":
      return PresentationIcon
    case "file":
      if (mime?.startsWith("image/")) return FileImageIcon
      if (mime?.startsWith("video/")) return FileVideoIcon
      if (mime?.startsWith("audio/")) return FileAudioIcon
      if (mime === "application/pdf" || mime?.startsWith("text/")) return FileTextIcon
      if (mime && /zip|tar|gzip|compressed/.test(mime)) return FileArchiveIcon
      return FileIcon
  }
}

/** A file's icon on a tinted tile in its app's colour. `size` is the tile's edge in px. */
export function KindIcon({ kind, mime, size = 32, className = "" }: { kind: Kind; mime?: string | null; size?: number; className?: string }) {
  const Icon = iconFor(kind, mime)
  const color = KIND_COLORS[kind]
  const style: CSSProperties = {
    width: size,
    height: size,
    color,
    background: `color-mix(in oklab, ${color} 14%, transparent)`,
    borderRadius: Math.round(size * 0.28),
  }
  return (
    <span className={`inline-grid shrink-0 place-items-center ${className}`} style={style} aria-hidden>
      <Icon style={{ width: size * 0.56, height: size * 0.56 }} strokeWidth={1.75} fill={kind === "folder" ? "currentColor" : "none"} fillOpacity={kind === "folder" ? 0.25 : 0} />
    </span>
  )
}

/** The drive's mark: three stacked sheets in the apps' colours. */
export function DriveLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="9" y="3" width="17" height="21" rx="4" fill={KIND_COLORS.deck} transform="rotate(12 17.5 13.5)" />
      <rect x="7.5" y="5.5" width="17" height="21" rx="4" fill={KIND_COLORS.sheet} transform="rotate(4 16 16)" />
      <rect x="6" y="8" width="17" height="21" rx="4" fill={KIND_COLORS.doc} />
      <rect x="10" y="14" width="9" height="2" rx="1" fill="white" opacity=".9" />
      <rect x="10" y="18.5" width="6" height="2" rx="1" fill="white" opacity=".7" />
    </svg>
  )
}
