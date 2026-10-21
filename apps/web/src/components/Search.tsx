import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Dialog, DialogContent, DialogTitle, useHotkeys } from "@alexandernygard/components"
import { DOC_KINDS, APPS, timeAgo, type Item } from "@alexandernygard/drive"
import { KindIcon } from "@alexandernygard/drive/react"
import { PlusIcon, SearchIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { createDocument, openItem } from "../lib/actions"
import { navigate } from "../lib/router"
import { drive, useDrive } from "../lib/store"

/** ⌘K: find any file by name, or start a new document. */
export function SearchCommand({ parentId }: { parentId: string | null }) {
  const open = useDrive((s) => s.searchOpen)
  const set = useDrive((s) => s.set)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Item[]>([])
  useHotkeys("mod+k", (e) => {
    e.preventDefault()
    set({ searchOpen: !useDrive.getState().searchOpen })
  })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = setTimeout(
      () => {
        const req = q.trim() ? drive.list("search", { q }) : drive.list("recent")
        req.then((l) => !cancelled && setResults(l.items.slice(0, 12))).catch(() => {})
      },
      q ? 120 : 0,
    )
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, open])

  const close = () => set({ searchOpen: false })
  return (
    <Dialog open={open} onOpenChange={(o) => set({ searchOpen: o })}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} className="[&_[cmdk-input-wrapper]]:h-12">
      <CommandInput value={q} onValueChange={setQ} placeholder="Search files and folders" />
      <CommandList>
        <CommandEmpty>Nothing called “{q}”.</CommandEmpty>
        {results.length > 0 && (
          <CommandGroup heading={q.trim() ? "Files" : "Recent"}>
            {results.map((i) => (
              <CommandItem
                key={i.id}
                value={i.id}
                onSelect={() => {
                  close()
                  openItem(i)
                }}
              >
                <KindIcon kind={i.kind} mime={i.mime} size={22} />
                <span className="flex-1 truncate">{i.name}</span>
                <span className="text-xs text-muted-foreground">{timeAgo(i.updatedAt)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {q.trim() && (
          <CommandGroup heading="Search">
            <CommandItem
              value="all"
              onSelect={() => {
                close()
                navigate({ name: "search", q })
              }}
            >
              <SearchIcon /> Show all results for “{q}”
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Create">
          {DOC_KINDS.map((k) => (
            <CommandItem
              key={k}
              value={`new-${k}`}
              onSelect={() => {
                close()
                void createDocument(k, parentId)
              }}
            >
              <PlusIcon /> New {APPS[k].noun.toLowerCase()}
              <span className="ml-auto text-xs text-muted-foreground">{APPS[k].label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
