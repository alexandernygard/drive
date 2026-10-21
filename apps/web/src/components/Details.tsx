import { Button, ScrollArea, Skeleton } from "@alexandernygard/components"
import { APPS, displayName, firstName, formatBytes, isDocKind, KIND_LABELS, timeAgo, type Activity, type Item } from "@alexandernygard/drive"
import { KindIcon, PersonAvatar } from "@alexandernygard/drive/react"
import { ExternalLinkIcon, GlobeIcon, UserPlusIcon, XIcon } from "lucide-react"
import { openItem } from "../lib/actions"
import { useActivity } from "../lib/data"
import { editorsOf, useDrive } from "../lib/store"
import { Cover } from "./Cover"
import { editingText } from "./ItemViews"

export function DetailsPanel({ item }: { item: Item }) {
  const set = useDrive((s) => s.set)
  const presence = useDrive((s) => s.presence)
  const account = useDrive((s) => s.account)
  const meId = account.status === "signed-in" ? account.me.id : undefined
  const editors = editorsOf(item, presence, meId)
  const activity = useActivity(item.id)

  return (
    <aside className="flex h-full w-[22rem] shrink-0 flex-col border-l bg-background" aria-label="Details">
      <header className="flex items-center gap-3 px-4 py-3">
        <KindIcon kind={item.kind} mime={item.mime} size={28} />
        <h2 className="min-w-0 flex-1 truncate font-medium">{item.name}</h2>
        <Button variant="ghost" size="icon-sm" onClick={() => set({ detailsOpen: false })} aria-label="Close details">
          <XIcon />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-4 pb-6">
          {item.kind !== "folder" && <Cover item={item} className="aspect-[4/3] rounded-xl border" />}
          <div className="flex gap-2">
            {!item.trashedAt && (
              <Button className="flex-1" onClick={() => openItem(item)}>
                <ExternalLinkIcon />
                {isDocKind(item.kind) ? `Open in ${APPS[item.kind].label}` : "Open"}
              </Button>
            )}
            {!item.trashedAt && (
              <Button variant="outline" className="flex-1" onClick={() => set({ shareId: item.id })}>
                <UserPlusIcon /> Share
              </Button>
            )}
          </div>

          {editors.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Here now</h3>
              <p className="mb-3 text-sm text-muted-foreground">{editingText(editors)}.</p>
              <ul className="space-y-2">
                {editors.map((e) => (
                  <li key={e.id} className="flex items-center gap-2.5 text-sm">
                    <PersonAvatar person={e} size={26} live />
                    <span className="flex-1 truncate">{displayName(e)}</span>
                    <span className="text-xs text-muted-foreground">since {new Date(e.since).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-medium">Who has access</h3>
              {!item.trashedAt && (
                <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => set({ shareId: item.id })}>
                  Manage
                </button>
              )}
            </div>
            <ul className="space-y-2">
              <li className="flex items-center gap-2.5 text-sm">
                <PersonAvatar person={item.owner} size={26} ring={false} />
                <span className="flex-1 truncate">{item.owner.id === meId ? "You" : displayName(item.owner)}</span>
                <span className="text-xs text-muted-foreground">Owner</span>
              </li>
              {item.sharedWith.map((s) => (
                <li key={s.email} className="flex items-center gap-2.5 text-sm">
                  <PersonAvatar person={s.person ?? { id: s.email, email: s.email, name: null, picture: null }} size={26} ring={false} />
                  <span className="flex-1 truncate">{s.person?.id === meId ? "You" : s.person ? displayName(s.person) : s.email}</span>
                  <span className="text-xs text-muted-foreground">{s.person ? (s.role === "editor" ? "Can edit" : "Can view") : "Invited"}</span>
                </li>
              ))}
              {item.linkRole && (
                <li className="flex items-center gap-2.5 text-sm">
                  <span className="grid size-[26px] place-items-center rounded-full bg-positive/15 text-positive">
                    <GlobeIcon className="size-3.5" />
                  </span>
                  <span className="flex-1">Anyone with the link</span>
                  <span className="text-xs text-muted-foreground">{item.linkRole === "editor" ? "Can edit" : "Can view"}</span>
                </li>
              )}
            </ul>
            {item.inherited ? (
              <p className="mt-2 text-xs text-muted-foreground">You have access through a shared folder.</p>
            ) : (
              item.sharedViaFolder && <p className="mt-2 text-xs text-muted-foreground">Everyone the folder above is shared with can open this too.</p>
            )}
            {item.sharedBy && (
              <p className="mt-3 text-xs text-muted-foreground">
                {displayName(item.sharedBy)} shared this with you {timeAgo(item.sharedAt ?? item.createdAt)}.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium">About</h3>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Type</dt>
              <dd>{item.kind === "file" ? (item.mime ?? "File") : `${KIND_LABELS[item.kind]}${isDocKind(item.kind) ? ` (${APPS[item.kind].label})` : ""}`}</dd>
              {item.size != null && (
                <>
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>{formatBytes(item.size)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Modified</dt>
              <dd>
                {timeAgo(item.updatedAt)}
                {item.updatedBy && ` by ${item.updatedBy.id === meId ? "you" : firstName(item.updatedBy)}`}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{new Date(item.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</dd>
              {item.openedAt && (
                <>
                  <dt className="text-muted-foreground">You opened</dt>
                  <dd>{timeAgo(item.openedAt)}</dd>
                </>
              )}
            </dl>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium">Activity</h3>
            {!activity.data ? (
              <div className="space-y-2">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : activity.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="relative space-y-3 border-l pl-4">
                {activity.data.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full border-2 border-background bg-muted-foreground/40" />
                    <p>
                      <span className="font-medium">{a.actor ? (a.actor.id === meId ? "You" : firstName(a.actor)) : "Someone"}</span> {describe(a, false)}
                    </p>
                    <p className="text-xs text-muted-foreground">{timeAgo(a.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </ScrollArea>
    </aside>
  )
}

/** "edited", "shared it with kari@… (can edit)", … `withName` adds the item's name for feeds across items. */
export function describe(a: Activity, withName: boolean): string {
  const it = withName ? `“${a.itemName}”` : "it"
  switch (a.action) {
    case "created":
      return a.detail?.startsWith("Copy of") ? `made ${it} as a copy` : `created ${it}`
    case "edited":
      return `edited ${it}`
    case "renamed":
      return `renamed ${it}${a.detail ? ` from “${a.detail}”` : ""}`
    case "moved":
      return `moved ${it} to ${a.detail ?? "another folder"}`
    case "shared": {
      const [email, role] = (a.detail ?? "").split(":")
      return `shared ${it} with ${email} (${role === "editor" ? "can edit" : "can view"})`
    }
    case "unshared":
      return `removed ${a.detail ?? "someone"} from ${it}`
    case "trashed":
      return `moved ${it} to the trash`
    case "restored":
      return `restored ${it}`
    case "uploaded":
      return `uploaded ${it}`
    case "link":
      return a.detail === "off" ? `turned off link sharing for ${it}` : `let anyone with the link ${a.detail === "editor" ? "edit" : "view"} ${it}`
  }
}
