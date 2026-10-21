import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Skeleton } from "@alexandernygard/components"
import type { Crumb, Item } from "@alexandernygard/drive"
import { KindIcon, ShareDialog } from "@alexandernygard/drive/react"
import { ChevronRightIcon, HomeIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { createFolder, move, rename } from "../lib/actions"
import { navigate } from "../lib/router"
import { drive, useDrive } from "../lib/store"

/** All dialogs, driven by the store so any menu can open them. */
export function Dialogs() {
  const { shareId, renaming, moving, newFolderIn, set } = useDrive()
  return (
    <>
      <ShareDialog
        itemId={shareId}
        open={!!shareId}
        onOpenChange={(open) => {
          if (open) return
          set({ shareId: null })
          // Arrived from an app's "Manage sharing" link: drop ?share= from the address.
          if (location.search.includes("share=")) history.replaceState(null, "", location.pathname)
        }}
        onChange={() => useDrive.setState((s) => ({ changed: s.changed + 1 }))}
      />
      <NameDialog
        open={!!renaming}
        title="Rename"
        initial={renaming?.name ?? ""}
        action="Rename"
        onClose={() => set({ renaming: null })}
        onSubmit={async (name) => {
          if (renaming) await rename(renaming, name)
        }}
      />
      <NameDialog
        open={newFolderIn !== undefined}
        title="New folder"
        initial="Untitled folder"
        action="Create"
        onClose={() => set({ newFolderIn: undefined })}
        onSubmit={async (name) => {
          const f = await createFolder(name, newFolderIn ?? null)
          if (f) navigate({ name: "folder", id: f.id })
        }}
      />
      <MoveDialog item={moving} onClose={() => set({ moving: null })} />
    </>
  )
}

function NameDialog({ open, title, initial, action, onClose, onSubmit }: { open: boolean; title: string; initial: string; action: string; onClose(): void; onSubmit(name: string): Promise<void> }) {
  const [name, setName] = useState(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setName(initial)
  }, [open, initial])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            setBusy(true)
            await onSubmit(name.trim())
            setBusy(false)
            onClose()
          }}
          className="space-y-4"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} aria-label="Name" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Pick a folder to move an item into, browsing the owner's folders. */
function MoveDialog({ item, onClose }: { item: Item | null; onClose(): void }) {
  const [at, setAt] = useState<string | null>(null)
  const [folders, setFolders] = useState<Item[] | null>(null)
  const [path, setPath] = useState<Crumb[]>([])
  const owner = item?.role === "owner"

  useEffect(() => {
    if (item) setAt(owner ? null : item.parentId)
  }, [item, owner])

  useEffect(() => {
    if (!item) return
    let cancelled = false
    setFolders(null)
    const req = at ? drive.list("mine", { parent: at }) : drive.list("mine")
    req
      .then((l) => {
        if (cancelled) return
        setFolders(l.items.filter((i) => i.kind === "folder" && i.id !== item.id))
        setPath(at ? l.path : [{ id: null, name: "My files" }])
      })
      .catch(() => !cancelled && setFolders([]))
    return () => {
      cancelled = true
    }
  }, [item, at])

  if (!item) return null
  const here = path[path.length - 1]
  const canDropHere = (at !== null || owner) && at !== item.parentId
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="truncate">Move “{item.name}”</DialogTitle>
          <DialogDescription>Choose a folder.</DialogDescription>
        </DialogHeader>
        <nav className="flex flex-wrap items-center gap-0.5 px-4 pt-3 text-sm" aria-label="Folder path">
          {path.map((c, i) => (
            <span key={c.id ?? "root"} className="flex items-center">
              {i > 0 && <ChevronRightIcon className="size-3.5 text-muted-foreground" />}
              <button
                className="rounded-md px-1.5 py-0.5 hover:bg-muted disabled:opacity-50"
                disabled={c.id === null && !owner}
                onClick={() => setAt(c.id)}
              >
                {c.id === null ? <HomeIcon className="inline size-3.5 align-[-2px]" /> : c.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="h-64 overflow-y-auto px-2 py-2">
          {!folders ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : folders.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No folders in here.</p>
          ) : (
            folders.map((f) => (
              <button key={f.id} onClick={() => setAt(f.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                <KindIcon kind="folder" size={24} />
                <span className="flex-1 truncate">{f.name}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
        <DialogFooter className="border-t px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!canDropHere}
            onClick={async () => {
              await move(item, at, here?.name ?? "My files")
              onClose()
            }}
          >
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
