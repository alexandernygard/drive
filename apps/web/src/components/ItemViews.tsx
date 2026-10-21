import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tooltip, TooltipContent, TooltipTrigger } from "@alexandernygard/components"
import { colorFor, displayName, firstName, formatBytes, KIND_LABELS, timeAgo, type Editor, type Item } from "@alexandernygard/drive"
import { AvatarStack, KindIcon, PersonAvatar } from "@alexandernygard/drive/react"
import { EllipsisIcon, GlobeIcon, StarIcon, UsersIcon } from "lucide-react"
import { useState, type DragEvent } from "react"
import { move, openItem } from "../lib/actions"
import { editorsOf, useDrive } from "../lib/store"
import { Cover } from "./Cover"
import { ItemContextMenu, ItemDropdown } from "./ItemMenu"

export type Column = "owner" | "sharedBy" | "trashed" | "opened"

const DRAG_TYPE = "application/x-drive-item"

function useMe() {
  const a = useDrive((s) => s.account)
  return a.status === "signed-in" ? a.me : null
}

const who = (p: { id: string } & Parameters<typeof firstName>[0], meId?: string) => (p.id === meId ? "you" : firstName(p))

/** "Edited 5 min ago by Ola", or how it reached you in the views where that matters. */
export function metaLine(item: Item, column: Column | undefined, meId?: string): string {
  if (column === "trashed" && item.trashedAt) return `Deleted ${timeAgo(item.trashedAt)}`
  if (column === "sharedBy" && item.sharedBy) return `${firstName(item.sharedBy)} shared ${timeAgo(item.sharedAt ?? item.createdAt)}`
  if (column === "opened" && item.openedAt) return `You opened ${timeAgo(item.openedAt)}`
  if (item.kind === "file") return `${item.size != null ? formatBytes(item.size) + ", " : ""}added ${timeAgo(item.createdAt)}`
  return `Edited ${timeAgo(item.updatedAt)}${item.updatedBy ? ` by ${who(item.updatedBy, meId)}` : ""}`
}

/** "Ola is editing", "Ola and Kari are editing", "Ola and 3 others are editing". */
export function editingText(editors: Editor[]) {
  const names = editors.map((e) => firstName(e))
  if (names.length === 1) return `${names[0]} is editing`
  if (names.length === 2) return `${names[0]} and ${names[1]} are editing`
  return `${names[0]} and ${names.length - 1} others are editing`
}

/** Who it is shared with (for your files) or whose it is (for theirs). */
export function Sharing({ item, meId, size = 22 }: { item: Item; meId?: string; size?: number }) {
  if (item.owner.id !== meId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PersonAvatar person={item.owner} size={size} ring={false} />
          </span>
        </TooltipTrigger>
        <TooltipContent>Owned by {displayName(item.owner)}</TooltipContent>
      </Tooltip>
    )
  }
  const people = item.sharedWith.map((s) => s.person ?? { id: s.email, email: s.email, name: null, picture: null })
  if (people.length === 0 && !item.linkRole) {
    if (!item.sharedViaFolder) return null
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <UsersIcon className="size-3.5 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>Shared through its folder</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      {item.linkRole && (
        <Tooltip>
          <TooltipTrigger asChild>
            <GlobeIcon className="size-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>Anyone with the link can {item.linkRole === "editor" ? "edit" : "view"}</TooltipContent>
        </Tooltip>
      )}
      <AvatarStack people={people} size={size} max={3} label={(p) => `Shared with ${displayName(p)}`} />
    </span>
  )
}

function dragProps(item: Item) {
  if (item.role === "viewer" || item.trashedAt) return {}
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: item.id, name: item.name }))
      e.dataTransfer.effectAllowed = "move"
    },
  }
}

/** Make an element a drop target that moves dragged items into `folder` (null = My files). */
export function useDropInto(folderId: string | null, folderName: string, enabled = true) {
  const [over, setOver] = useState(false)
  if (!enabled) return { over: false, props: {} }
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = "move"
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false)
        const raw = e.dataTransfer.getData(DRAG_TYPE)
        if (!raw) return
        e.preventDefault()
        e.stopPropagation()
        const dragged = JSON.parse(raw) as { id: string; name: string }
        if (dragged.id !== folderId) void move(dragged, folderId, folderName)
      },
    },
  }
}

function LiveBadge({ editors }: { editors: Editor[] }) {
  if (editors.length === 0) return null
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-background/92 py-0.5 pr-2 pl-0.5 text-[11px] font-medium shadow-sm ring-1 ring-black/5 backdrop-blur">
      <AvatarStack people={editors} size={18} max={3} label={(p) => `${displayName(p)} is here now`} />
      <span className="max-w-[9rem] truncate">{editingText(editors)}</span>
    </span>
  )
}

export function ItemCard({ item, column }: { item: Item; column?: Column }) {
  const me = useMe()
  const presence = useDrive((s) => s.presence)
  const editors = editorsOf(item, presence, me?.id)
  const live = editors.length > 0
  const ring = live ? `0 0 0 2px var(--background), 0 0 0 4px ${colorFor(editors[0]!.id || editors[0]!.email)}` : undefined
  return (
    <ItemContextMenu item={item}>
      <div
        role="link"
        tabIndex={0}
        aria-label={`${item.name}, ${KIND_LABELS[item.kind]}`}
        onClick={() => openItem(item)}
        onKeyDown={(e) => e.key === "Enter" && openItem(item)}
        {...dragProps(item)}
        className="group relative flex cursor-pointer flex-col rounded-2xl border bg-card p-1.5 text-left outline-none transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-[0_10px_30px_-18px_rgb(24_33_43/0.5)] focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative">
          <Cover item={item} className="aspect-[4/3] rounded-xl" />
          {live && <span className="pointer-events-none absolute inset-0 rounded-xl transition-shadow" style={{ boxShadow: ring }} />}
          <div className="absolute top-2 left-2">
            <LiveBadge editors={editors} />
          </div>
          {item.starred && <StarIcon className="absolute top-2.5 right-2.5 size-4 fill-highlight text-highlight drop-shadow" />}
        </div>
        <div className="flex items-start gap-2.5 px-1.5 pt-2.5 pb-1">
          <KindIcon kind={item.kind} mime={item.mime} size={22} className="mt-px" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-snug font-medium">{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">{metaLine(item, column, me?.id)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Sharing item={item} meId={me?.id} size={20} />
            <ItemDropdown item={item}>
              <Button variant="ghost" size="icon-sm" className="-mr-1 size-7 opacity-60 group-hover:opacity-100" aria-label={`Actions for ${item.name}`}>
                <EllipsisIcon />
              </Button>
            </ItemDropdown>
          </div>
        </div>
      </div>
    </ItemContextMenu>
  )
}

export function FolderTile({ item, column }: { item: Item; column?: Column }) {
  const me = useMe()
  const drop = useDropInto(item.id, item.name, item.role !== "viewer" && !item.trashedAt)
  return (
    <ItemContextMenu item={item}>
      <div
        role="link"
        tabIndex={0}
        onClick={() => openItem(item)}
        onKeyDown={(e) => e.key === "Enter" && openItem(item)}
        {...dragProps(item)}
        {...drop.props}
        className={`group flex cursor-pointer items-center gap-3 rounded-xl border bg-card py-2.5 pr-1.5 pl-3 outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring ${drop.over ? "border-highlight bg-highlight/10" : ""}`}
      >
        <KindIcon kind="folder" size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          {(column === "trashed" || column === "sharedBy") && <p className="truncate text-xs text-muted-foreground">{metaLine(item, column)}</p>}
        </div>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Sharing item={item} meId={me?.id} size={20} />
          <ItemDropdown item={item}>
            <Button variant="ghost" size="icon-sm" className="size-7 opacity-60 group-hover:opacity-100" aria-label={`Actions for ${item.name}`}>
              <EllipsisIcon />
            </Button>
          </ItemDropdown>
        </div>
      </div>
    </ItemContextMenu>
  )
}

export function ItemGrid({ items, column }: { items: Item[]; column?: Column }) {
  const folders = items.filter((i) => i.kind === "folder")
  const files = items.filter((i) => i.kind !== "folder")
  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <section aria-label="Folders">
          <h3 className="mb-2.5 text-sm font-medium text-muted-foreground">Folders</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5">
            {folders.map((f) => (
              <FolderTile key={f.id} item={f} column={column} />
            ))}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section aria-label="Files">
          {folders.length > 0 && <h3 className="mb-2.5 text-sm font-medium text-muted-foreground">Files</h3>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-3">
            {files.map((f) => (
              <ItemCard key={f.id} item={f} column={column} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function ItemTable({ items, column }: { items: Item[]; column?: Column }) {
  const me = useMe()
  const presence = useDrive((s) => s.presence)
  const third = column === "sharedBy" ? "Shared by" : column === "trashed" ? "Deleted" : column === "opened" ? "Opened" : "Modified"
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[46%]">Name</TableHead>
          <TableHead className="hidden md:table-cell">Owner</TableHead>
          <TableHead className="hidden lg:table-cell">Access</TableHead>
          <TableHead className="hidden sm:table-cell">{third}</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <Row key={item.id} item={item} column={column} meId={me?.id} editors={editorsOf(item, presence, me?.id)} />
        ))}
      </TableBody>
    </Table>
  )
}

function Row({ item, column, meId, editors }: { item: Item; column?: Column; meId?: string; editors: Editor[] }) {
  const drop = useDropInto(item.id, item.name, item.kind === "folder" && item.role !== "viewer" && !item.trashedAt)
  const third =
    column === "sharedBy" && item.sharedBy ? (
      <span className="flex items-center gap-2">
        <PersonAvatar person={item.sharedBy} size={20} ring={false} />
        {firstName(item.sharedBy)}, {timeAgo(item.sharedAt ?? item.createdAt)}
      </span>
    ) : column === "trashed" && item.trashedAt ? (
      timeAgo(item.trashedAt)
    ) : column === "opened" && item.openedAt ? (
      timeAgo(item.openedAt)
    ) : (
      <>
        {timeAgo(item.updatedAt)}
        {item.updatedBy && <span className="text-muted-foreground"> by {who(item.updatedBy, meId)}</span>}
      </>
    )
  return (
    <ItemContextMenu item={item}>
      <TableRow
        tabIndex={0}
        onClick={() => openItem(item)}
        onKeyDown={(e) => e.key === "Enter" && openItem(item)}
        {...dragProps(item)}
        {...drop.props}
        className={`group cursor-pointer ${drop.over ? "bg-highlight/10" : ""}`}
      >
        <TableCell className="py-2">
          <div className="flex min-w-0 items-center gap-3">
            <KindIcon kind={item.kind} mime={item.mime} size={28} />
            <span className="truncate font-medium">{item.name}</span>
            {item.starred && <StarIcon className="size-3.5 shrink-0 fill-highlight text-highlight" />}
            {editors.length > 0 && (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <AvatarStack people={editors} size={18} max={3} live label={(p) => `${displayName(p)} is here now`} />
                <span className="hidden xl:inline">{editingText(editors)}</span>
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="hidden text-muted-foreground md:table-cell">
          <span className="flex items-center gap-2">
            <PersonAvatar person={item.owner} size={20} ring={false} />
            {item.owner.id === meId ? "You" : firstName(item.owner)}
          </span>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          {item.owner.id === meId && item.sharedWith.length === 0 && !item.linkRole ? (
            <span className="text-muted-foreground">{item.sharedViaFolder ? "Through folder" : "Only you"}</span>
          ) : item.owner.id !== meId ? (
            <span className="text-muted-foreground">{item.role === "editor" ? "Can edit" : "Can view"}</span>
          ) : (
            <Sharing item={item} meId={meId} size={20} />
          )}
        </TableCell>
        <TableCell className="hidden text-sm sm:table-cell">{third}</TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <ItemDropdown item={item}>
            <Button variant="ghost" size="icon-sm" className="opacity-50 group-hover:opacity-100" aria-label={`Actions for ${item.name}`}>
              <EllipsisIcon />
            </Button>
          </ItemDropdown>
        </TableCell>
      </TableRow>
    </ItemContextMenu>
  )
}
