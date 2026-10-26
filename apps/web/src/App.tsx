import { Button, Spinner } from "@alexandernygard/components"
import type { Me, View } from "@alexandernygard/drive"
import { DriveLogo, KindIcon } from "@alexandernygard/drive/react"
import { useEffect } from "react"
import { DetailsPanel } from "./components/Details"
import { Dialogs } from "./components/Dialogs"
import { SearchCommand } from "./components/Search"
import { Shell, type Place } from "./components/Shell"
import { useListing } from "./lib/data"
import { useRoute, type Route } from "./lib/router"
import { drive, signIn, useDrive } from "./lib/store"
import { Browse } from "./pages/Browse"
import { Home } from "./pages/Home"

export function App() {
  const account = useDrive((s) => s.account)
  useEffect(() => void signIn(), [])

  if (account.status === "loading")
    return (
      <div className="grid h-svh place-items-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  if (account.status === "signed-out") return <SignedOut />
  if (account.status === "error")
    return (
      <div className="grid h-svh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <p className="font-medium">The drive isn't reachable right now.</p>
          <p className="text-sm text-muted-foreground">{account.message}</p>
          <Button variant="outline" onClick={() => void signIn()}>
            Try again
          </Button>
        </div>
      </div>
    )
  return <Signed me={account.me} />
}

const viewOf = (r: Route): View => (r.name === "files" || r.name === "folder" ? "mine" : r.name)

function Signed({ me }: { me: Me }) {
  const route = useRoute()
  const selected = useDrive((s) => s.selected)
  const detailsOpen = useDrive((s) => s.detailsOpen)
  // Home fetches its own sections; every other view is one listing.
  const listing = useListing(route.name === "home" ? "recent" : viewOf(route), {
    parent: route.name === "folder" ? route.id : undefined,
    q: route.name === "search" ? route.q : undefined,
  })

  const folder = route.name === "folder" ? listing.data?.folder : null
  const place: Place =
    route.name === "folder" ? { parentId: route.id, canAdd: !!folder && folder.role !== "viewer" } : { parentId: null, canAdd: route.name === "files" || route.name === "home" }

  // Keep the details panel on the freshest copy of the item.
  const shown = selected && (listing.data?.items.find((i) => i.id === selected.id) ?? selected)

  useEffect(() => {
    document.title = route.name === "folder" && folder ? `${folder.name} – Drive` : "Drive"
  }, [route, folder])

  return (
    <>
      <Shell route={route} place={place} me={me} aside={detailsOpen && shown ? <DetailsPanel item={shown} /> : undefined}>
        {route.name === "home" ? <Home me={me} /> : <Browse key={route.name} route={route} listing={listing} place={place} />}
      </Shell>
      <Dialogs />
      <SearchCommand parentId={place.canAdd ? place.parentId : null} />
    </>
  )
}

function SignedOut() {
  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden px-6">
      <div className="relative w-full max-w-md text-center">
        <div className="mb-8 flex justify-center gap-3">
          {(["doc", "sheet", "deck", "diagram"] as const).map((k, i) => (
            <span key={k} style={{ transform: `rotate(${(i - 1) * 7}deg) translateY(${i === 1 ? -6 : 0}px)` }}>
              <KindIcon kind={k} size={56} />
            </span>
          ))}
        </div>
        <div className="mb-3 flex items-center justify-center gap-2">
          <DriveLogo size={26} />
          <span className="text-xl font-semibold tracking-tight">Drive</span>
        </div>
        <p className="mx-auto max-w-sm text-muted-foreground">Your documents, sheets, decks and diagrams from word2, xl2, ppt2 and arrowsmith, and everything people share with you, in one place.</p>
        <Button size="lg" className="mt-8" asChild>
          <a href={drive.loginUrl(location.href)}>Sign in</a>
        </Button>
      </div>
    </div>
  )
}
