import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
} from "@alexandernygard/components"
import type { Item, Kind, Listing, View } from "@alexandernygard/drive"
import { KindIcon } from "@alexandernygard/drive/react"
import { ChevronRightIcon, LayoutGridIcon, ListIcon, PlusIcon, UserPlusIcon } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { NewMenu, type Place } from "../components/Shell"
import { ItemGrid, ItemTable, Sharing, useDropInto, type Column } from "../components/ItemViews"
import { emptyTrash } from "../lib/actions"
import { linkProps, type Route } from "../lib/router"
import { useDrive } from "../lib/store"

interface ViewInfo {
  title: string
  blurb?: string
  column?: Column
  empty: { kind: Kind; title: string; text: string }
  sort: Sort
}

type Sort = "name" | "modified" | "none"

const VIEWS: Record<Exclude<View, "home">, ViewInfo> = {
  mine: { title: "My files", sort: "name", empty: { kind: "folder", title: "Nothing here yet", text: "Create a document, sheet or deck, or drop files here to upload them." } },
  shared: {
    title: "Shared with me",
    blurb: "Files and folders people have shared with you, newest first.",
    column: "sharedBy",
    sort: "none",
    empty: { kind: "doc", title: "Nothing shared with you yet", text: "When someone shares a file with you, it shows up here." },
  },
  sharing: {
    title: "Shared by me",
    blurb: "Everything you own that other people can open.",
    sort: "modified",
    empty: { kind: "sheet", title: "You haven't shared anything", text: "Share a file from its menu, or from Share in any of the apps." },
  },
  recent: { title: "Recent", blurb: "Files you opened lately.", column: "opened", sort: "none", empty: { kind: "deck", title: "No recent files", text: "Files you open show up here." } },
  starred: { title: "Starred", sort: "none", empty: { kind: "doc", title: "No starred files", text: "Star files you come back to, and find them here." } },
  trash: {
    title: "Trash",
    blurb: "Items in the trash are deleted forever after 30 days.",
    column: "trashed",
    sort: "none",
    empty: { kind: "file", title: "The trash is empty", text: "Deleted files stay here for 30 days." },
  },
  search: { title: "Search", sort: "none", empty: { kind: "file", title: "No matches", text: "Try a shorter or different name." } },
}

function sorted(items: Item[], sort: Sort): Item[] {
  if (sort === "none") return items
  const byFolder = (a: Item, b: Item) => Number(b.kind === "folder") - Number(a.kind === "folder")
  return [...items].sort((a, b) => byFolder(a, b) || (sort === "name" ? a.name.localeCompare(b.name, undefined, { numeric: true }) : b.updatedAt - a.updatedAt))
}

export function Browse({ route, listing, place }: { route: Route; listing: { data: Listing | null; error: string | null }; place: Place }) {
  const layout = useDrive((s) => s.layout)
  const set = useDrive((s) => s.set)
  const view: Exclude<View, "home"> = route.name === "folder" || route.name === "files" ? "mine" : route.name === "home" ? "mine" : route.name
  const info = VIEWS[view]
  const [sort, setSort] = useState<Sort>(info.sort)
  const folder = listing.data?.folder ?? null
  const items = useMemo(() => sorted(listing.data?.items ?? [], sort), [listing.data, sort])

  const title: ReactNode =
    route.name === "folder" ? (
      <Breadcrumbs listing={listing.data} />
    ) : route.name === "search" ? (
      <>Results for “{route.q}”</>
    ) : (
      info.title
    )

  return (
    <div className="mx-auto max-w-6xl pt-4">
      <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h1 className="text-[clamp(1.4rem,2.4vw,1.85rem)] leading-tight font-semibold tracking-[-0.015em]">{title}</h1>
          {route.name === "folder" && folder ? (
            <FolderMeta folder={folder} />
          ) : (
            info.blurb && <p className="mt-1 text-sm text-muted-foreground">{info.blurb}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {route.name === "folder" && folder && (
            <Button variant="outline" size="sm" onClick={() => set({ shareId: folder.id })}>
              <UserPlusIcon /> Share folder
            </Button>
          )}
          {(route.name === "folder" || route.name === "files") && place.canAdd && (
            <NewMenu place={place}>
              <Button size="sm">
                <PlusIcon /> New
              </Button>
            </NewMenu>
          )}
          {view === "trash" && items.length > 0 && <EmptyTrashButton />}
          {info.sort !== "none" && (
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger size="sm" className="w-[8.5rem]" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="modified">Last modified</SelectItem>
              </SelectContent>
            </Select>
          )}
          <ToggleGroup type="single" variant="outline" size="sm" value={layout} onValueChange={(v) => v && set({ layout: v as "grid" })}>
            <ToggleGroupItem value="grid" aria-label="Grid">
              <LayoutGridIcon />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List">
              <ListIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {listing.error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{listing.error}</p>
      ) : !listing.data ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-[4/3.9] rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia>
              <EmptyArt kind={info.empty.kind} />
            </EmptyMedia>
            <EmptyTitle>{route.name === "folder" ? "This folder is empty" : info.empty.title}</EmptyTitle>
            <EmptyDescription>{route.name === "folder" && !place.canAdd ? "You can view this folder, but not add to it." : info.empty.text}</EmptyDescription>
          </EmptyHeader>
          {(route.name === "folder" || route.name === "files") && place.canAdd && (
            <EmptyContent>
              <NewMenu place={place}>
                <Button>
                  <PlusIcon /> New
                </Button>
              </NewMenu>
            </EmptyContent>
          )}
        </Empty>
      ) : layout === "grid" ? (
        <ItemGrid items={items} column={info.column} />
      ) : (
        <div className="rounded-2xl border bg-card px-2">
          <ItemTable items={items} column={info.column} />
        </div>
      )}
    </div>
  )
}

function Breadcrumbs({ listing }: { listing: Listing | null }) {
  if (!listing) return <Skeleton className="h-8 w-48" />
  return (
    <nav aria-label="Folder path" className="flex min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap">
      {listing.path.map((c, i) => {
        const last = i === listing.path.length - 1
        return (
          <span key={c.id ?? "root"} className="flex min-w-0 items-center gap-x-1">
            {i > 0 && <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground/60" />}
            {last ? <span className="truncate">{c.name}</span> : <Crumb id={c.id} name={c.name} root={i === 0} />}
          </span>
        )
      })}
    </nav>
  )
}

/** A breadcrumb you can drop items on to move them up. */
function Crumb({ id, name, root }: { id: string | null; name: string; root: boolean }) {
  const to: Route = id ? { name: "folder", id } : name === "My files" ? { name: "files" } : { name: "shared" }
  const drop = useDropInto(id, name, !!id || name === "My files")
  return (
    <a {...linkProps(to)} {...drop.props} className={`truncate rounded-lg px-1 text-muted-foreground hover:text-foreground ${drop.over ? "bg-highlight/20 text-foreground" : ""} ${root ? "-ml-1" : ""}`}>
      {name}
    </a>
  )
}

function FolderMeta({ folder }: { folder: Item }) {
  const account = useDrive((s) => s.account)
  const meId = account.status === "signed-in" ? account.me.id : undefined
  const shared = folder.sharedWith.length > 0 || folder.linkRole
  return (
    <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
      {folder.owner.id !== meId ? (
        <>
          <Sharing item={folder} meId={meId} size={20} />
          <span>
            {folder.owner.name ?? folder.owner.email}'s folder, you can {folder.role === "editor" ? "edit" : "view"}
          </span>
        </>
      ) : shared ? (
        <>
          <Sharing item={folder} meId={meId} size={20} />
          <span>Shared with {folder.sharedWith.length} {folder.sharedWith.length === 1 ? "person" : "people"}{folder.linkRole ? " and anyone with the link" : ""}</span>
        </>
      ) : (
        <span>Only you</span>
      )}
    </div>
  )
}

function EmptyTrashButton() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          Empty trash
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Empty the trash?</AlertDialogTitle>
          <AlertDialogDescription>Everything you own in the trash is deleted forever, for everyone it was shared with. This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void emptyTrash()}>
            Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Three tilted tiles, the view's own kind in front. */
function EmptyArt({ kind }: { kind: Kind }) {
  const others = (["doc", "sheet", "deck", "folder"] as Kind[]).filter((k) => k !== kind).slice(0, 2)
  return (
    <div className="relative h-24 w-36" aria-hidden>
      <span className="absolute top-3 left-2 -rotate-12 opacity-60">
        <KindIcon kind={others[0]!} size={52} />
      </span>
      <span className="absolute top-3 right-2 rotate-12 opacity-60">
        <KindIcon kind={others[1]!} size={52} />
      </span>
      <span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-[18px] bg-background p-1">
        <KindIcon kind={kind} size={64} />
      </span>
    </div>
  )
}
