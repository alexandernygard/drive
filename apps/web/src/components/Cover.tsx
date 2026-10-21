import { KIND_COLORS, type Item, type Preview } from "@alexandernygard/drive"
import { KindIcon } from "@alexandernygard/drive/react"
import { useState, type CSSProperties } from "react"
import { drive } from "../lib/store"

/**
 * A miniature of the item's real content: the top of a document's first page, a sheet's first rows, a
 * deck's first slide. Uses the app's thumbnail when it has sent one.
 */
export function Cover({ item, className = "" }: { item: Item; className?: string }) {
  const color = KIND_COLORS[item.kind]
  const style = { "--kind": color, background: `color-mix(in oklab, ${color} 9%, var(--muted))` } as CSSProperties
  const thumb = drive.thumbnailUrl(item)
  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {thumb && item.kind === "deck" ? (
        // Slides are 16:9: frame the picture as a slide rather than cropping it.
        <div className="absolute inset-0 grid place-items-center px-[10%]">
          <img src={thumb} alt="" loading="lazy" className="aspect-video w-full rounded-[4px] object-cover shadow-[0_8px_20px_-8px_rgb(20_27_45/0.6)]" />
        </div>
      ) : thumb ? (
        <img src={thumb} alt="" className="absolute inset-0 size-full object-cover object-top" loading="lazy" />
      ) : item.kind === "doc" ? (
        <DocCover name={item.name} preview={item.preview} />
      ) : item.kind === "sheet" ? (
        <SheetCover preview={item.preview} />
      ) : item.kind === "deck" ? (
        <DeckCover name={item.name} preview={item.preview} />
      ) : item.kind === "file" ? (
        <FileCover item={item} />
      ) : (
        <div className="grid size-full place-items-center">
          <KindIcon kind={item.kind} size={56} />
        </div>
      )}
    </div>
  )
}

function DocCover({ name, preview }: { name: string; preview: Preview | null }) {
  const lines = (preview?.text ?? "").split("\n").filter((l) => l.trim()).slice(0, 14)
  return (
    <div className="absolute inset-x-[14%] top-[12%] bottom-0 rounded-t-[3px] bg-white px-[9%] pt-[8%] text-[#18212b] shadow-[0_1px_3px_rgb(24_33_43/0.12),0_6px_16px_-6px_rgb(24_33_43/0.18)]">
      <p className="truncate text-[9px] leading-tight font-semibold">{preview?.title || name}</p>
      <div className="mt-[5px] space-y-[3px]">
        {lines.length > 0
          ? lines.map((l, i) => {
              const heading = /^#{1,6}\s/.test(l)
              return (
                <p key={i} className={`line-clamp-2 text-[6.5px] leading-[1.45] ${heading ? "pt-[2px] font-semibold text-[#18212b]" : "text-[#18212b]/60"}`}>
                  {l.replace(/^#{1,6}\s+/, "")}
                </p>
              )
            })
          : [92, 100, 84, 96, 60].map((w, i) => <div key={i} className="h-[4px] rounded-full bg-[#18212b]/[0.07]" style={{ width: `${w}%` }} />)}
      </div>
    </div>
  )
}

const COLS = ["A", "B", "C", "D", "E"]

function SheetCover({ preview }: { preview: Preview | null }) {
  const rows = preview?.rows?.length ? preview.rows : null
  const cols = Math.max(4, Math.min(5, rows?.[0]?.length ?? 4))
  const body = rows ?? Array.from({ length: 7 }, () => [])
  return (
    <div className="absolute inset-x-[10%] top-[12%] bottom-0 overflow-hidden rounded-t-[3px] bg-white text-[#18212b] shadow-[0_1px_3px_rgb(24_33_43/0.12),0_6px_16px_-6px_rgb(24_33_43/0.18)]">
      <table className="w-full table-fixed border-collapse text-[6.5px] leading-none">
        <thead>
          <tr className="bg-[#f1f4f6] text-[#18212b]/45">
            <th className="w-[9%] border-r border-b border-[#dde3e8] py-[3px] font-normal" />
            {COLS.slice(0, cols).map((c) => (
              <th key={c} className="border-r border-b border-[#dde3e8] py-[3px] font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.slice(0, 8).map((row, r) => (
            <tr key={r}>
              <td className="border-r border-b border-[#dde3e8] bg-[#f1f4f6] py-[3px] text-center text-[#18212b]/45">{r + 1}</td>
              {COLS.slice(0, cols).map((_, c) => (
                <td
                  key={c}
                  className={`truncate border-r border-b border-[#dde3e8] px-[3px] py-[3px] ${rows && r === 0 ? "font-semibold" : ""} ${isNumber(row[c]) ? "text-right tabular-nums" : ""}`}
                  style={rows && r === 0 ? { background: "color-mix(in oklab, var(--kind) 12%, white)" } : undefined}
                >
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const isNumber = (s: string | undefined) => !!s && /^-?[\d.,\s%$€£kr]+$/.test(s.trim()) && /\d/.test(s)

function DeckCover({ name, preview }: { name: string; preview: Preview | null }) {
  const slides = preview?.slides ?? []
  const title = slides[0] || preview?.title || name
  return (
    <div className="absolute inset-0 grid place-items-center px-[10%]">
      <div className="relative w-full">
        {slides.length > 1 && (
          <>
            <div className="absolute inset-0 translate-x-[8px] -translate-y-[8px] rounded-[4px] bg-[#141b2d]/25" />
            <div className="absolute inset-0 translate-x-[4px] -translate-y-[4px] rounded-[4px] bg-[#141b2d]/45" />
          </>
        )}
        <div className="relative flex aspect-video w-full flex-col justify-center overflow-hidden rounded-[4px] bg-[#141b2d] px-[9%] text-white shadow-[0_8px_20px_-8px_rgb(20_27_45/0.6)]">
          <div className="mb-[6%] h-[3px] w-[18%] rounded-full" style={{ background: "var(--kind)" }} />
          <p className="line-clamp-2 text-[11px] leading-tight font-semibold tracking-tight">{title}</p>
          {slides[1] && <p className="mt-[4%] truncate text-[7px] text-white/55">Next: {slides[1]}</p>}
        </div>
      </div>
      {slides.length > 0 && (
        <span className="absolute right-[10%] bottom-[7%] rounded-full bg-black/45 px-1.5 py-px text-[9px] font-medium text-white tabular-nums backdrop-blur-sm">
          {slides.length} {slides.length === 1 ? "slide" : "slides"}
        </span>
      )}
    </div>
  )
}

function FileCover({ item }: { item: Item }) {
  const [broken, setBroken] = useState(false)
  if (item.mime?.startsWith("image/") && !broken)
    return <img src={drive.contentUrl(item.id)} alt="" loading="lazy" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
  const ext = item.name.includes(".") ? item.name.split(".").pop()!.slice(0, 5).toUpperCase() : null
  return (
    <div className="grid size-full place-items-center">
      <div className="flex flex-col items-center gap-2">
        <KindIcon kind="file" mime={item.mime} size={52} />
        {ext && <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">{ext}</span>}
      </div>
    </div>
  )
}
