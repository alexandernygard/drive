import { Button, Skeleton } from "@alexandernygard/components"
import { APPS, DOC_KINDS, firstName, KIND_COLORS, timeAgo, type DocKind, type Me } from "@alexandernygard/drive"
import { KindIcon, PersonAvatar } from "@alexandernygard/drive/react"
import { PlusIcon } from "lucide-react"
import { useMemo } from "react"
import { describe } from "../components/Details"
import { ItemCard, ItemGrid } from "../components/ItemViews"
import { createDocument, openItem } from "../lib/actions"
import { useActivity, useListing } from "../lib/data"
import { linkProps } from "../lib/router"
import { editorsOf, useDrive } from "../lib/store"

function greeting(now = new Date()) {
  const h = now.getHours()
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

export function Home({ me }: { me: Me }) {
  const home = useListing("home")
  const shared = useListing("shared")
  const presence = useDrive((s) => s.presence)

  const { liveNow, recent } = useMemo(() => {
    const items = home.data?.items ?? []
    return {
      liveNow: items.filter((i) => editorsOf(i, presence, me.id).length > 0),
      recent: items.filter((i) => i.openedAt).slice(0, 12),
    }
  }, [home.data, presence, me.id])

  return (
    <div className="mx-auto max-w-6xl space-y-10 pt-6">
      <section>
        <h1 className="text-[clamp(1.75rem,3vw,2.4rem)] leading-tight font-semibold tracking-[-0.02em]">
          {greeting()}, {firstName(me)}
        </h1>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {DOC_KINDS.map((k) => (
            <BlankTile key={k} kind={k} />
          ))}
        </div>
      </section>

      {liveNow.length > 0 && (
        <section aria-labelledby="live-heading">
          <div className="mb-3 flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-positive" />
            </span>
            <h2 id="live-heading" className="text-lg font-semibold tracking-tight">
              Open right now
            </h2>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-3">
            {liveNow.map((i) => (
              <ItemCard key={i.id} item={i} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="recent-heading">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="recent-heading" className="text-lg font-semibold tracking-tight">
            Recent
          </h2>
          <a {...linkProps({ name: "recent" })} className="text-sm text-muted-foreground hover:text-foreground">
            See all
          </a>
        </div>
        {!home.data ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/3.9] rounded-2xl" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            Files you open show up here. Start one above, or drop files anywhere to upload them.
          </p>
        ) : (
          <ItemGrid items={recent} column="opened" />
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="shared-heading">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="shared-heading" className="text-lg font-semibold tracking-tight">
              Shared with you
            </h2>
            <a {...linkProps({ name: "shared" })} className="text-sm text-muted-foreground hover:text-foreground">
              See all
            </a>
          </div>
          {!shared.data ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : shared.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">When someone shares a file with you, it shows up here with who shared it.</p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card">
              {shared.data.items.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <button onClick={() => openItem(i)} className="flex w-full items-center gap-3 px-4 py-3 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-muted/60">
                    <KindIcon kind={i.kind} mime={i.mime} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.sharedBy ? `${firstName(i.sharedBy)} shared it ${timeAgo(i.sharedAt ?? i.createdAt)}` : `From ${firstName(i.owner)}`}
                        {i.role === "editor" ? ", you can edit" : ", view only"}
                      </span>
                    </span>
                    {i.sharedBy && <PersonAvatar person={i.sharedBy} size={26} ring={false} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <ActivityFeed meId={me.id} />
      </div>
    </div>
  )
}

/** A blank page in the app's colour: the quickest way to start a document. */
function BlankTile({ kind }: { kind: DocKind }) {
  const color = KIND_COLORS[kind]
  const app = APPS[kind]
  return (
    <button
      onClick={() => void createDocument(kind, null)}
      className="group relative flex h-28 items-end overflow-hidden rounded-2xl border bg-card p-4 text-left outline-none transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-[0_14px_34px_-20px_rgb(24_33_43/0.55)] focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${color} 10%, var(--card)), var(--card) 70%)` }}
    >
      {/* The blank sheet, tilted, waiting. */}
      <span
        className="absolute top-3 right-4 h-24 w-[4.2rem] rotate-6 rounded-md bg-white shadow-[0_8px_20px_-10px_rgb(24_33_43/0.45)] transition-transform duration-300 group-hover:rotate-3 group-hover:-translate-y-1 motion-reduce:transition-none"
        style={kind === "deck" ? { width: "5.6rem", height: "3.4rem", top: "1.4rem", background: "#141b2d" } : undefined}
      >
        <span className="absolute top-3 left-2.5 h-1 w-8 rounded-full" style={{ background: color }} />
        {kind !== "deck" && [0, 1, 2].map((i) => <span key={i} className="absolute left-2.5 h-[3px] rounded-full bg-black/[0.08]" style={{ top: 22 + i * 7, width: 40 - i * 8 }} />)}
        <span className="absolute right-2 bottom-2 grid size-6 place-items-center rounded-full text-white" style={{ background: color }}>
          <PlusIcon className="size-3.5" strokeWidth={2.5} />
        </span>
      </span>
      <span className="relative max-w-[calc(100%-6rem)]">
        <span className="block text-[15px] leading-tight font-semibold">New {app.noun.toLowerCase()}</span>
        <span className="block text-xs text-muted-foreground">in {app.label}</span>
      </span>
    </button>
  )
}

function ActivityFeed({ meId }: { meId: string }) {
  const activity = useActivity()
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="mb-3 text-lg font-semibold tracking-tight">
        Latest activity
      </h2>
      {!activity.data ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : activity.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Edits, shares and moves in your files and files shared with you.</p>
      ) : (
        <ul className="space-y-1">
          {dedupe(activity.data)
            .slice(0, 8)
            .map((a) => (
              <li key={a.id}>
                <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2 text-left font-normal whitespace-normal" onClick={() => openItem({ id: a.itemId, kind: a.itemKind })}>
                  {a.actor ? <PersonAvatar person={a.actor} size={28} ring={false} /> : <KindIcon kind={a.itemKind} size={28} />}
                  <span className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-medium">{a.actor ? (a.actor.id === meId ? "You" : firstName(a.actor)) : "Someone"}</span> {describe(a, true)}
                    <span className="block text-xs text-muted-foreground">{timeAgo(a.at)}</span>
                  </span>
                </Button>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}

/** Several edits to the same file in a row read as one. */
function dedupe<T extends { itemId: string; action: string; actor: { id: string } | null }>(list: T[]): T[] {
  return list.filter((a, i) => {
    const prev = list[i - 1]
    return !prev || prev.itemId !== a.itemId || prev.action !== a.action || prev.actor?.id !== a.actor?.id
  })
}
