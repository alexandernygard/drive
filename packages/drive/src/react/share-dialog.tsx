import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from "@alexandernygard/components"
import { CheckIcon, GlobeIcon, LinkIcon, LockIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { getDrive, type DriveClient, DriveError } from "../client.js"
import { displayName } from "../format.js"
import type { Item, Person, ShareRole } from "../types.js"
import { PersonAvatar } from "./avatars.js"
import { KindIcon } from "./icons.js"

const ROLE_LABEL: Record<string, string> = { owner: "Owner", editor: "Can edit", viewer: "Can view" }

const errorText = (e: unknown) => (e instanceof DriveError ? e.message : "Something went wrong. Try again.")

export interface ShareDialogProps {
  itemId: string | null
  open: boolean
  onOpenChange(open: boolean): void
  /** Called with the item after every change. */
  onChange?(item: Item): void
  drive?: DriveClient
  /** The item, if the caller already has it (shown at once, then refreshed). */
  initial?: Item | null
}

/**
 * Who has access to an item, and changing it: invite people by email as viewer or editor, change or
 * remove their role, and turn "anyone with the link" on or off. The same dialog in the drive and in the apps.
 */
export function ShareDialog({ itemId, open, onOpenChange, onChange, drive = getDrive(), initial = null }: ShareDialogProps) {
  const [item, setItem] = useState<Item | null>(initial)
  const [people, setPeople] = useState<Person[]>([])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<ShareRole>("editor")
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !itemId) return
    if (initial?.id === itemId) setItem(initial)
    else setItem(null)
    let cancelled = false
    drive
      .item(itemId)
      .then((r) => !cancelled && setItem(r.item))
      .catch((e) => !cancelled && toast.error(errorText(e)))
    drive
      .people()
      .then((p) => !cancelled && setPeople(p))
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId])

  const canManage = item?.role === "owner" || item?.role === "editor"
  const update = (next: Item) => {
    setItem(next)
    onChange?.(next)
  }
  const run = async (fn: () => Promise<Item | void>) => {
    setBusy(true)
    try {
      const next = await fn()
      if (next) update(next)
      return true
    } catch (e) {
      toast.error(errorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const invite = async () => {
    const list = email
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!item || list.length === 0) return
    let last: Item | undefined
    const ok = await run(async () => {
      for (const e of list) last = await drive.share(item.id, e, role)
      return last
    })
    if (ok) {
      setEmail("")
      toast.success(list.length === 1 ? `Shared with ${list[0]}` : `Shared with ${list.length} people`)
    }
  }

  const suggestions = useMemo(() => {
    const q = email.trim().toLowerCase()
    if (!q || !item) return []
    const taken = new Set([item.owner.email.toLowerCase(), ...item.sharedWith.map((s) => s.email)])
    return people.filter((p) => !taken.has(p.email.toLowerCase()) && (p.email.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q))).slice(0, 4)
  }, [email, people, item])

  const link = item ? drive.openUrl(item) : ""
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-3 border-b px-5 py-4 text-left">
          {item ? <KindIcon kind={item.kind} mime={item.mime} size={36} /> : <Skeleton className="size-9 rounded-xl" />}
          <div className="min-w-0">
            <DialogTitle className="truncate">Share {item ? `“${item.name}”` : ""}</DialogTitle>
            <DialogDescription>{item?.kind === "folder" ? "Everyone you add can open everything inside." : "People you add see it under Shared with me."}</DialogDescription>
          </div>
        </DialogHeader>

        {canManage && (
          <div className="relative border-b px-5 py-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void invite()
              }}
            >
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Add people by email"
                type="text"
                inputMode="email"
                autoComplete="off"
                autoFocus
                aria-label="Email addresses"
                className="flex-1"
              />
              <Select value={role} onValueChange={(v) => setRole(v as ShareRole)}>
                <SelectTrigger className="w-[7.5rem]" aria-label="Role for new people">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Can edit</SelectItem>
                  <SelectItem value="viewer">Can view</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={busy || !email.trim()}>
                Share
              </Button>
            </form>
            {suggestions.length > 0 && (
              <div className="absolute inset-x-5 top-full z-10 -mt-2 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => setEmail(p.email)}
                  >
                    <PersonAvatar person={p} size={24} ring={false} />
                    <span className="min-w-0 flex-1 truncate">
                      {displayName(p)} <span className="text-muted-foreground">{p.email}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="max-h-[min(22rem,50vh)] overflow-y-auto px-5 py-3">
          <p className="pb-2 text-[13px] font-medium text-muted-foreground">People with access</p>
          {!item ? (
            <div className="space-y-3 py-1">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : (
            <ul className="space-y-1">
              <PersonRow person={item.owner} label="Owner" />
              {item.sharedWith.map((s) => (
                <PersonRow
                  key={s.email}
                  person={s.person ?? { id: s.email, email: s.email, name: null, picture: null }}
                  pending={!s.person}
                  label={ROLE_LABEL[s.role]!}
                  control={
                    canManage ? (
                      <Select
                        value={s.role}
                        onValueChange={(v) => void run(() => (v === "remove" ? drive.unshare(item.id, s.email) : drive.share(item.id, s.email, v as ShareRole)))}
                      >
                        <SelectTrigger size="sm" className="w-[7.25rem] border-transparent shadow-none hover:bg-muted" aria-label={`Role for ${s.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectItem value="editor">Can edit</SelectItem>
                          <SelectItem value="viewer">Can view</SelectItem>
                          <SelectSeparator />
                          <SelectItem value="remove" className="text-destructive">
                            Remove access
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 border-t bg-muted/40 px-5 py-4">
          <p className="text-[13px] font-medium text-muted-foreground">General access</p>
          <div className="flex items-center gap-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${item?.linkRole ? "bg-positive/15 text-positive" : "bg-muted text-muted-foreground"}`}>
              {item?.linkRole ? <GlobeIcon className="size-4" /> : <LockIcon className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              {canManage && item ? (
                <Select value={item.linkRole ?? "off"} onValueChange={(v) => void run(() => drive.setLinkRole(item.id, v === "off" ? null : (v as ShareRole)))}>
                  <SelectTrigger size="sm" className="-ml-2 h-7 border-transparent px-2 font-medium shadow-none hover:bg-muted" aria-label="General access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Only people added</SelectItem>
                    <SelectItem value="viewer">Anyone with the link can view</SelectItem>
                    <SelectItem value="editor">Anyone with the link can edit</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium">{item?.linkRole ? `Anyone with the link ${item.linkRole === "editor" ? "can edit" : "can view"}` : "Only people added"}</p>
              )}
              <p className="text-xs text-muted-foreground">{item?.linkRole ? "Anyone signed in with a Nyggis account who has the link." : "Only the people above can open it."}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copy} disabled={!item}>
              {copied ? <CheckIcon /> : <LinkIcon />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PersonRow({ person, label, control, pending }: { person: Person; label: string; control?: React.ReactNode; pending?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-lg py-1.5">
      <PersonAvatar person={person} size={32} ring={false} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {person.name || person.email}
          {pending && <span className="ml-2 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">Invited</span>}
        </p>
        {person.name && <p className="truncate text-xs text-muted-foreground">{person.email}</p>}
      </div>
      {control ?? <span className="pr-2 text-sm text-muted-foreground">{label}</span>}
    </li>
  )
}
